import { fileURLToPath } from "node:url";
import {
  type BaseResolver,
  bundle,
  type Document,
  lintDocument,
  type NormalizedProblem,
  type Config as RedoclyConfig,
} from "@redocly/openapi-core";
import type { Logger } from "../../application/ports/logger.js";
import type {
  LoadedSchema,
  SchemaLoader,
  SchemaLoadRequest,
} from "../../application/ports/schema-loader.js";
import { withStackOverflowReportedAsync } from "../../application/stack-overflow.js";
import { WARNING_CODES, warningText } from "../../domain/warnings.js";
import type { OpenAPI3 } from "../../types.js";
import { removeBundledMappingCopies, schemaKeysOf } from "./bundled-mapping-copies.js";
import { repairBundledRefs } from "./bundled-ref-repair.js";
import { loadedDocuments, localFilesRead } from "./loaded-documents.js";
import { findMalformedRefs, malformedRefsError } from "./malformed-refs.js";
import {
  type ComponentRenaming,
  componentKeysOf,
  renameQueryNamedComponents,
} from "./query-named-components.js";
import { RefAccessResolver } from "./ref-access.js";
import { checkRefsResolve } from "./ref-resolution-check.js";
import { REF_CYCLE_MESSAGE } from "./ref-resolution-steps.js";
import { type RemoteDocumentLimits, resolveConfigWithAccess } from "./remote-fetch.js";
import {
  loadFailedError,
  refCycleError,
  schemaInvalidError,
  versionUnsupportedError,
} from "./schema-load-errors.js";
import { parseSchema } from "./schema-source.js";
import { findUnsupportedKeys, unsupportedKeysError } from "./unsupported-keys.js";

/**
 * The SchemaLoader port on Redocly 1.34 (ADR-005): parse any inherited source type, then lint and
 * bundle with the given Redocly config. Problems go to the logger; errors fail the load.
 */
export interface RedoclySchemaLoaderOptions {
  readonly redoc: RedoclyConfig;
  readonly logger: Logger;
  /** A monotonic time in milliseconds, for the debug durations. */
  readonly now: () => number;
  /** Time limit of one remote fetch, unless the Redocly config brings its own `customFetch`. */
  readonly remoteRefTimeoutMs: number;
  readonly remoteDocumentLimits: RemoteDocumentLimits;
}

const UNSUPPORTED_FORMAT_MESSAGE = "Unsupported schema format, expected `openapi: 3.x`";

/**
 * Accept OpenAPI 3.x only; Swagger 2 and other formats get their own message. An empty file or a
 * `null` root parses to nothing, so it is checked before any field is read.
 */
function assertOpenAPI3(document: unknown): void {
  if (typeof document !== "object" || document === null) {
    throw versionUnsupportedError(UNSUPPORTED_FORMAT_MESSAGE, {});
  }
  const parsed = document as Record<string, unknown>;
  const openapiVersion = Number.parseFloat(parsed.openapi as string);
  const isOpenAPI3 =
    !parsed.swagger &&
    Boolean(parsed.openapi) &&
    !Number.isNaN(openapiVersion) &&
    openapiVersion >= 3 &&
    openapiVersion < 4;
  if (isOpenAPI3) {
    return;
  }
  if (parsed.swagger) {
    throw versionUnsupportedError(
      "Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.",
      parsed,
    );
  }
  if (parsed.openapi || openapiVersion < 3 || openapiVersion >= 4) {
    throw versionUnsupportedError(`Unsupported OpenAPI version: ${parsed.openapi}`, parsed);
  }
  throw versionUnsupportedError(UNSUPPORTED_FORMAT_MESSAGE, parsed);
}

/**
 * The name an inline source (a string, object, buffer or stream) gets inside the working
 * directory. Redocly resolves relative `$ref`s against the directory of the document, so the
 * document must be named as a file in the working directory, not as the directory itself.
 */
const INLINE_SOURCE_NAME = "inline-source";

/** The base for relative `$ref`s: the source file or URL itself, else a file in the cwd. */
function sourceAbsoluteRef(source: unknown, cwd: URL): string {
  const document = source instanceof URL ? source : new URL(INLINE_SOURCE_NAME, cwd);
  return document.protocol === "file:" ? sourceFilePath(document) : document.href;
}

/**
 * The path of a `file:` source. A URL that names no path on this platform (an encoded slash, a
 * host on POSIX, no drive letter on Windows) cannot be read, so it fails as a read would.
 */
function sourceFilePath(source: URL): string {
  try {
    return fileURLToPath(source);
  } catch (error) {
    // Node.js reports these as TypeErrors (ERR_INVALID_FILE_URL_PATH, ERR_INVALID_FILE_URL_HOST).
    if (!(error instanceof TypeError)) {
      throw error;
    }
    throw loadFailedError(source.href, error);
  }
}

/** Report the document problems Redocly throws as typed errors; anything else passes through. */
async function rethrowDocumentError(
  error: unknown,
  root: Document,
  resolver: BaseResolver,
): Promise<never> {
  if (error instanceof Error && error.message === REF_CYCLE_MESSAGE) {
    throw refCycleError(error);
  }
  if (error instanceof URIError) {
    throw malformedRefsError(findMalformedRefs(await loadedDocuments(root, resolver)), error);
  }
  if (error instanceof TypeError) {
    const keys = findUnsupportedKeys(await loadedDocuments(root, resolver));
    throw keys.length === 0 ? error : unsupportedKeysError(keys, error);
  }
  throw error;
}

class RedoclySchemaLoader implements SchemaLoader {
  readonly #options: RedoclySchemaLoaderOptions;

  constructor(options: RedoclySchemaLoaderOptions) {
    this.#options = options;
  }

  async load(request: SchemaLoadRequest): Promise<LoadedSchema> {
    const resolver = this.#resolver(request);
    // Parsing is guarded too: `JSON.stringify` of a deep object source overflows the stack on
    // Node.js 22 and 24, before linting starts.
    const bundled = await withStackOverflowReportedAsync("load", () =>
      this.#parseAndBundle(request, resolver),
    ).catch((error: unknown) => {
      throw resolver.firstRefusal ?? error;
    });
    // A refused `$ref` is an unresolved-`$ref` problem, which a Redocly config can turn off.
    if (resolver.firstRefusal !== undefined) {
      throw resolver.firstRefusal;
    }
    return bundled;
  }

  async #parseAndBundle(request: SchemaLoadRequest, resolver: BaseResolver): Promise<LoadedSchema> {
    const { logger, now } = this.#options;
    const configLoadedAt = now();
    logger.debug("Loaded Redoc config", "redoc", now() - configLoadedAt);
    const parseStartedAt = now();
    const absoluteRef = sourceAbsoluteRef(request.source, request.cwd);
    const document = await parseSchema(request.source, { absoluteRef, resolver });
    logger.debug("Parsed schema", "redoc", now() - parseStartedAt);
    assertOpenAPI3(document.parsed);
    const bundled = await this.#lintAndBundle(document, resolver, request.shouldLint);
    const isRootAFile = request.source instanceof URL && request.source.protocol === "file:";
    const localFiles = await localFilesRead(document, resolver, isRootAFile);
    return { document: bundled, localFiles };
  }

  #resolver(request: SchemaLoadRequest): RefAccessResolver {
    const { redoc, remoteRefTimeoutMs, remoteDocumentLimits } = this.#options;
    const config = resolveConfigWithAccess(redoc.resolve, {
      timeoutMs: remoteRefTimeoutMs,
      access: request.refAccess,
      rootUrl: request.source instanceof URL ? request.source.href : undefined,
      maxParallelFetches: remoteDocumentLimits.maxParallelFetches,
      bodyLimits: remoteDocumentLimits,
    });
    return new RefAccessResolver(config, {
      access: request.refAccess,
      maxRemoteDocuments: remoteDocumentLimits.maxDocuments,
      maxRemoteNodes: remoteDocumentLimits.maxNodes,
    });
  }

  async #lintAndBundle(
    document: Document,
    resolver: BaseResolver,
    shouldLint: boolean,
  ): Promise<OpenAPI3> {
    const rethrow = (error: unknown) => rethrowDocumentError(error, document, resolver);
    // Redocly leaves unhandled rejections behind when a `$ref` fails in two documents (ADR-031).
    await checkRefsResolve(document, resolver, this.#options.redoc.styleguide).catch(rethrow);
    if (shouldLint) {
      await this.#lint(document, resolver).catch(rethrow);
    }
    return this.#bundle(document, resolver).catch(rethrow);
  }

  async #lint(document: Document, resolver: BaseResolver): Promise<void> {
    const startedAt = this.#options.now();
    const problems = await lintDocument({
      document,
      config: this.#options.redoc.styleguide,
      externalRefResolver: resolver,
    });
    this.#report(problems);
    this.#options.logger.debug("Linted schema", "lint", this.#options.now() - startedAt);
  }

  async #bundle(document: Document, resolver: BaseResolver): Promise<OpenAPI3> {
    const startedAt = this.#options.now();
    const schemaKeys = schemaKeysOf(document.parsed);
    const componentKeys = componentKeysOf(document.parsed);
    // The lint resolver: documents it already loaded are not fetched again.
    const bundled = await bundle({
      config: this.#options.redoc,
      dereference: false,
      doc: document,
      externalRefResolver: resolver,
    });
    removeBundledMappingCopies(bundled.bundle.parsed, schemaKeys);
    repairBundledRefs(bundled.bundle.parsed);
    const documentRefs = resolver.getFiles();
    const renaming = renameQueryNamedComponents(bundled.bundle.parsed, componentKeys, documentRefs);
    // The problems name the components the bundle made, so they are shown by their new names.
    this.#report(bundled.problems, renaming);
    this.#options.logger.debug("Bundled schema", "bundle", this.#options.now() - startedAt);
    return bundled.bundle.parsed;
  }

  /**
   * Report every problem; then throw if any of them is an error. A problem that the Redocly
   * config's `.redocly.lint-ignore.yaml` lists is left out, as `redocly lint` leaves it out
   * (upstream #2189).
   */
  #report(problems: readonly NormalizedProblem[], renaming = UNRENAMED): void {
    const errorMessages: string[] = [];
    for (const problem of problems) {
      if (problem.ignored === true) {
        this.#options.logger.debug(
          `Ignored by the lint ignore file: ${problemMessage(problem, renaming)}`,
          "lint",
        );
        continue;
      }
      const message = problemMessage(problem, renaming);
      if (problem.severity === "error") {
        errorMessages.push(message);
        this.#options.logger.error(message);
      } else {
        this.#options.logger.warn(lintWarningText(message, problem.ruleId));
      }
    }
    if (errorMessages.length > 0) {
      throw schemaInvalidError(errorMessages);
    }
  }
}

/** A lint warning names its rule, which `redocly.yaml` can turn off, and ends with its code. */
function lintWarningText(message: string, ruleId: string): string {
  return warningText(`${message}, rule ${ruleId}`, WARNING_CODES.LINT_PROBLEM);
}

/** Problems found before the bundle named any component. */
const UNRENAMED: ComponentRenaming = { pointer: (pointer) => pointer, text: (text) => text };

function problemMessage(problem: NormalizedProblem, renaming: ComponentRenaming): string {
  const location = problem.location?.[0]?.pointer;
  const message = renaming.text(problem.message);
  return location ? `${message} at ${renaming.pointer(location)}` : message;
}

/** A schema loader with one Redocly config and logger, for one or more loads. */
export function createRedoclySchemaLoader(options: RedoclySchemaLoaderOptions): SchemaLoader {
  return new RedoclySchemaLoader(options);
}
