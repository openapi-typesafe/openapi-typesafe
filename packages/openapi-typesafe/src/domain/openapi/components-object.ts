/** The component maps the generator writes types for, in output order (OpenAPI 3.1 §4.8.7). */
export const COMPONENT_KINDS = Object.freeze([
  "schemas",
  "responses",
  "parameters",
  "requestBodies",
  "headers",
  "pathItems",
] as const);

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

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
