import type ts from "typescript";

/**
 * The TypeScript compiler's types for code outside the bridge (ADR-004, decision 4). Type-only:
 * it is erased at build time, so importing it never loads TypeScript. Only the bridge imports
 * `typescript` itself (enforced by dependency-cruiser).
 */
export type { ts };
