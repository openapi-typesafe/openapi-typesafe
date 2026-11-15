import { pathToFileURL } from "node:url";
import type { BaseResolver, Document } from "@redocly/openapi-core";
import { isRemoteRef } from "./ref-urls.js";
import type { LoadedDocument } from "./unsupported-keys.js";

/** The documents one load read, from the Redocly resolver's cache. */

/**
 * The root document and every other document the resolver loaded, as far as they parsed. A root
 * read from a file or URL is in the resolver cache too, and is listed once. A `$ref` that failed
 * to load leaves a rejected entry in the cache, also when bundling did not need it (an example's
 * `$ref`): that entry is no document, and must not fail the listing.
 */
export async function loadedDocuments(
  root: Document,
  resolver: BaseResolver,
): Promise<LoadedDocument[]> {
  const settled = await Promise.allSettled(resolver.cache.values());
  const cached = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
  const bySource = new Map<string, unknown>([[root.source.absoluteRef, root.parsed]]);
  for (const document of cached) {
    if ("parsed" in document && !bySource.has(document.source.absoluteRef)) {
      bySource.set(document.source.absoluteRef, document.parsed);
    }
  }
  return [...bySource].map(([source, parsed]) => ({ source, parsed }));
}

/**
 * The local files the load read: the root, when it is a file, and every `$ref`'d file. Redocly
 * names a remote document by its http(s) URL and reads any other name as a path, relative to
 * the working directory if it is relative (as `pathToFileURL` resolves it), so every other name
 * is a local file the run read.
 * Keeping only absolute paths left out a root such as `s3://bucket/a.yaml`, which Redocly read
 * as `./s3:/bucket/a.yaml`, and the CLI then overwrote it. An inline root (a string, object,
 * buffer or stream) has a made-up path in the working directory, so it is left out unless it was
 * read from a file.
 */
export async function localFilesRead(
  root: Document,
  resolver: BaseResolver,
  isRootAFile: boolean,
): Promise<URL[]> {
  const documents = await loadedDocuments(root, resolver);
  return documents
    .map(({ source }) => source)
    .filter((source) => !isRemoteRef(source))
    .filter((source) => isRootAFile || source !== root.source.absoluteRef)
    .map((source) => pathToFileURL(source));
}
