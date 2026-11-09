import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseResolver,
  type Document,
  type Config as RedoclyConfig,
  type Source,
  YamlParseError,
} from "@redocly/openapi-core";
import type { RefAccess } from "../../application/ports/schema-loader.js";
import { ERROR_CODES, type OpenAPITypesafeError } from "../../domain/errors.js";
import { redactUrlSecrets } from "../../domain/url-secrets.js";
import { aliasExpansionFailure } from "./alias-limit.js";
import { isHostAllowed } from "./allowed-hosts.js";
import { isParsedSource, RemoteNodeLimit } from "./remote-node-limit.js";
import { refForbiddenError } from "./schema-load-errors.js";

/**
 * Limits on where `$ref` documents may be loaded from (threat model R1 and R2, ADR-017). The root
 * document is chosen by the developer and is always loaded; every other document must pass.
 */

type ResolveConfig = RedoclyConfig["resolve"];

/** Redocly treats only these prefixes as remote; any other `$ref` is a local file path. */
function isRemoteRef(absoluteRef: string): boolean {
  return absoluteRef.startsWith("http://") || absoluteRef.startsWith("https://");
}

/** Whether `target` is `root` or below it; both are absolute paths. */
export function isInsideDirectory(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  // Compare the first segment: a directory named `..hidden` is inside, `../x` is not.
  const isParent = relative === ".." || relative.startsWith(`..${path.sep}`);
  return !isParent && !path.isAbsolute(relative);
}

/** The real path, so a link inside the root that points outside it is caught. */
async function realPathOrSelf(file: string): Promise<string> {
  const absolute = path.resolve(file);
  try {
    return await realpath(absolute);
  } catch (error) {
    // A missing file is never read, and Redocly reports it. Resolve its nearest existing
    // directory instead, so it compares with the root's real path: the root may be reached
    // through a link (macOS `/tmp` is one), and the missing file must not look outside it.
    const parent = path.dirname(absolute);
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && parent !== absolute) {
      return path.join(await realPathOrSelf(parent), path.basename(absolute));
    }
    throw error;
  }
}

async function localRefusal(
  absoluteRef: string,
  localRoot: URL,
): Promise<OpenAPITypesafeError | undefined> {
  const root = await realPathOrSelf(fileURLToPath(localRoot));
  if (isInsideDirectory(await realPathOrSelf(absoluteRef), root)) {
    return undefined;
  }
  return refForbiddenError(absoluteRef, { reason: "outside-local-root", localRoot: root });
}

/** The refusal for one document, or undefined when the limits allow it. */
export async function refusalOf(
  absoluteRef: string,
  access: RefAccess,
): Promise<OpenAPITypesafeError | undefined> {
  if (!isRemoteRef(absoluteRef)) {
    return access.localRoot === undefined ? undefined : localRefusal(absoluteRef, access.localRoot);
  }
  if (access.remoteHosts === undefined || isHostAllowed(new URL(absoluteRef), access.remoteHosts)) {
    return undefined;
  }
  return refForbiddenError(absoluteRef, {
    reason: "host-not-allowed",
    allowedHosts: [...access.remoteHosts],
  });
}

/**
 * A remote document may refer only to other URLs (threat model T3). Redocly resolves a `$ref`
 * against a URL base with `new URL()`, so `C:/x` becomes `c:/x` and `file:///x` stays as it is;
 * Redocly then reads either from disk, and on Windows a drive letter is an absolute path.
 */
function localFromRemoteRefusal(
  base: string,
  absoluteRef: string,
): OpenAPITypesafeError | undefined {
  if (!isRemoteRef(base) || isRemoteRef(absoluteRef)) {
    return undefined;
  }
  const shownBase = redactUrlSecrets(base);
  return refForbiddenError(absoluteRef, { reason: "local-ref-from-remote", base: shownBase });
}

/** The limits one resolver checks; each load gets its own resolver. */
export interface RefAccessLimits {
  readonly access: RefAccess;
  /** Remote documents one load may fetch, the root included (threat model T2). */
  readonly maxRemoteDocuments: number;
  /** Nodes the remote documents of one load may parse into together (threat model T2). */
  readonly maxRemoteNodes: number;
}

/**
 * A Redocly resolver that checks each document before it loads it. Redocly turns a failed load
 * into an unresolved-`$ref` problem, so the refusals are also kept for the loader to report as
 * the typed error.
 */
export class RefAccessResolver extends BaseResolver {
  readonly #limits: RefAccessLimits;
  readonly #nodeLimit: RemoteNodeLimit;
  readonly #refusals: OpenAPITypesafeError[] = [];
  /** The root document's ref: it is chosen by the developer, so it is not limited. */
  #rootRef: string | undefined;
  /** Remote documents asked for so far; Redocly caches each one, so each is counted once. */
  #remoteDocumentCount = 0;

  constructor(config: ResolveConfig, limits: RefAccessLimits) {
    super(config);
    this.#limits = limits;
    this.#nodeLimit = new RemoteNodeLimit(limits.maxRemoteNodes);
  }

  /** The first document that was refused, if any. */
  get firstRefusal(): OpenAPITypesafeError | undefined {
    return this.#refusals[0];
  }

  override resolveDocument(
    base: string | null,
    ref: string,
    isRoot = false,
  ): ReturnType<BaseResolver["resolveDocument"]> {
    if (isRoot) {
      this.#rootRef = this.resolveExternalRef(base, ref);
    }
    const refusal =
      base === null ? undefined : localFromRemoteRefusal(base, this.resolveExternalRef(base, ref));
    if (refusal !== undefined) {
      this.#refusals.push(refusal);
      return Promise.reject(refusal);
    }
    return super.resolveDocument(base, ref, isRoot);
  }

  /** Refuse a YAML alias bomb before Redocly walks it (pre-beta test plan 10.2). */
  override parseDocument(source: Source, isRoot = false): Document {
    const document = this.#parsed(source, isRoot);
    const failure = aliasExpansionFailure(document.parsed);
    if (failure !== undefined) {
      throw new YamlParseError(failure, source);
    }
    return document;
  }

  /** A remote document is parsed within the node limit; any other one as Redocly parses it. */
  #parsed(source: Source, isRoot: boolean): Document {
    if (!isRemoteRef(source.absoluteRef) || !isParsedSource(source, isRoot)) {
      return super.parseDocument(source, isRoot);
    }
    try {
      return this.#nodeLimit.parse(source);
    } catch (error) {
      if (isRefusal(error)) {
        this.#refusals.push(error);
      }
      throw new YamlParseError(error as Error, source);
    }
  }

  override async loadExternalRef(absoluteRef: string): Promise<Source> {
    const refusal = this.#countRefusal(absoluteRef) ?? (await this.#accessRefusal(absoluteRef));
    if (refusal !== undefined) {
      this.#refusals.push(refusal);
      throw refusal;
    }
    try {
      return await super.loadExternalRef(absoluteRef);
    } catch (error) {
      // A refused redirect throws inside the fetch, and Redocly wraps it in a ResolveError.
      const cause = (error as { originalError?: unknown }).originalError;
      if (isRefusal(cause)) {
        this.#refusals.push(cause);
      }
      throw error;
    }
  }

  #accessRefusal(absoluteRef: string): Promise<OpenAPITypesafeError | undefined> {
    return absoluteRef === this.#rootRef
      ? Promise.resolve(undefined)
      : refusalOf(absoluteRef, this.#limits.access);
  }

  /**
   * A document that changes all its URLs can fan out without end: 150 `$ref`s per document, three
   * levels deep, made 16,212 requests and exhausted the local ports (audit B2, F4).
   */
  #countRefusal(absoluteRef: string): OpenAPITypesafeError | undefined {
    if (!isRemoteRef(absoluteRef)) {
      return undefined;
    }
    this.#remoteDocumentCount += 1;
    const { maxRemoteDocuments } = this.#limits;
    return this.#remoteDocumentCount > maxRemoteDocuments
      ? refForbiddenError(absoluteRef, {
          reason: "too-many-remote-documents",
          maxDocuments: maxRemoteDocuments,
        })
      : undefined;
  }
}

function isRefusal(value: unknown): value is OpenAPITypesafeError {
  return (value as { code?: unknown } | null)?.code === ERROR_CODES.SCHEMA_REF_FORBIDDEN;
}
