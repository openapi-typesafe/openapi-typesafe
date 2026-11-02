import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseResolver, type Config as RedoclyConfig, type Source } from "@redocly/openapi-core";
import type { RefAccess } from "../../application/ports/schema-loader.js";
import { ERROR_CODES, type OpenAPITypesafeError } from "../../domain/errors.js";
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

/** Whether the URL's host is listed, by host name alone or with its port. */
export function isHostAllowed(url: URL, hosts: readonly string[]): boolean {
  const listed = new Set(hosts.map((host) => host.trim().toLowerCase()));
  return listed.has(url.hostname.toLowerCase()) || listed.has(url.host.toLowerCase());
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
  try {
    return await realpath(file);
  } catch (error) {
    // A missing file is never read, and Redocly reports it; check the path as written instead.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return path.resolve(file);
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
 * A Redocly resolver that checks each document before it loads it. Redocly turns a failed load
 * into an unresolved-`$ref` problem, so the refusals are also kept for the loader to report as
 * the typed error.
 */
export class RefAccessResolver extends BaseResolver {
  readonly #access: RefAccess;
  readonly #refusals: OpenAPITypesafeError[] = [];
  /** The root document's ref: it is chosen by the developer, so it is not limited. */
  #rootRef: string | undefined;

  constructor(config: ResolveConfig, access: RefAccess) {
    super(config);
    this.#access = access;
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
    return super.resolveDocument(base, ref, isRoot);
  }

  override async loadExternalRef(absoluteRef: string): Promise<Source> {
    const refusal =
      absoluteRef === this.#rootRef ? undefined : await refusalOf(absoluteRef, this.#access);
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
}

function isRefusal(value: unknown): value is OpenAPITypesafeError {
  return (value as { code?: unknown } | null)?.code === ERROR_CODES.SCHEMA_REF_FORBIDDEN;
}
