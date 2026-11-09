import type { OpenAPITypesafeError } from "../../domain/errors.js";
import { refForbiddenError } from "./schema-load-errors.js";

/** The decoded size limits of the remote documents of one load (threat model T2). */
export interface RemoteBodyLimits {
  /** Bytes of one remote document's body after `Content-Encoding` is decoded. */
  readonly maxDocumentBytes: number;
  /** Bytes of the bodies of every remote document of one load together, decoded. */
  readonly maxTotalBytes: number;
}

/**
 * Reads remote bodies as a stream and stops at the limits. Fetch decodes `gzip`, `deflate` and
 * `br` before the body reaches the loader, so a body of a few megabytes on the wire can become
 * gigabytes in memory (a "gzip bomb"); counting the decoded bytes while they arrive stops it before
 * the memory is taken. One instance per load: the total covers every document of that load.
 */
export class RemoteBodyLimit {
  readonly #limits: RemoteBodyLimits;
  #totalBytes = 0;

  constructor(limits: RemoteBodyLimits) {
    this.#limits = limits;
  }

  /** The whole body of `response` from `url`; fails with `SCHEMA_REF_FORBIDDEN` past a limit. */
  async read(response: Response, url: string): Promise<ArrayBuffer> {
    const reader = response.body?.getReader();
    if (reader === undefined) {
      return new ArrayBuffer(0);
    }
    const chunks: Uint8Array[] = [];
    let documentBytes = 0;
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      documentBytes += next.value.byteLength;
      this.#totalBytes += next.value.byteLength;
      const refusal = this.#refusal(url, documentBytes);
      if (refusal !== undefined) {
        await reader.cancel();
        throw refusal;
      }
      chunks.push(next.value);
    }
    return joined(chunks, documentBytes);
  }

  #refusal(url: string, documentBytes: number): OpenAPITypesafeError | undefined {
    const { maxDocumentBytes, maxTotalBytes } = this.#limits;
    if (documentBytes > maxDocumentBytes) {
      return refForbiddenError(url, { reason: "remote-document-too-large", maxDocumentBytes });
    }
    return this.#totalBytes > maxTotalBytes
      ? refForbiddenError(url, { reason: "remote-documents-too-large", maxTotalBytes })
      : undefined;
  }
}

function joined(chunks: readonly Uint8Array[], byteLength: number): ArrayBuffer {
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
