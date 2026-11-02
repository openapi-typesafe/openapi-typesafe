import { createHash } from "node:crypto";
import type { Hasher } from "../application/ports.ts";

/** SHA-256 of the UTF-8 bytes, as lowercase hex. */
export class NodeHasher implements Hasher {
  sha256(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }
}
