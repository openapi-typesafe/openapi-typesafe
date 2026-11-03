import { MEDIA_TYPES_COMPONENT_KIND } from "./media-type-object.js";

/**
 * The component maps the generator always writes, in output order (OpenAPI 3.1 §4.8.7); a kind the
 * document lacks is `never`.
 */
export const COMPONENT_KINDS = Object.freeze([
  "schemas",
  "responses",
  "parameters",
  "requestBodies",
  "headers",
  "pathItems",
] as const);

/**
 * OpenAPI 3.2 component maps, written after `COMPONENT_KINDS` and only when the document has them,
 * so documents without them keep their output (ADR-020).
 */
export const DECLARED_COMPONENT_KINDS = Object.freeze([MEDIA_TYPES_COMPONENT_KIND] as const);

export type ComponentKind =
  | (typeof COMPONENT_KINDS)[number]
  | (typeof DECLARED_COMPONENT_KINDS)[number];

/** Components by kind and name; entries are read by each kind's transformer. */
export type ComponentsObject = {
  readonly [kind in ComponentKind]?: Readonly<Record<string, unknown>>;
};

/** `requestBodies` → `requestBody`; other kinds drop the final `s`. */
export function singularizeComponentKind(kind: ComponentKind | `x-${string}`): string {
  return kind === "requestBodies" ? "requestBody" : kind.slice(0, -1);
}

/**
 * Whether a schema is an enum that `--enum` turns into a TypeScript enum. With `--root-types`
 * such schemas get no root alias, because the enum is already exported under that name.
 */
export function isEnumSchema(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return false;
  }
  const record = schema as Record<string, unknown>;
  return (
    "enum" in record &&
    Array.isArray(record.enum) &&
    (!("type" in record) || record.type !== "object") &&
    !("properties" in record) &&
    !("additionalProperties" in record)
  );
}
