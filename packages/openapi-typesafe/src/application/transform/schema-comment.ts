import type { IrComment, IrPropertySignature } from "../../domain/ir/nodes.js";

/** Schema fields that produce JSDoc lines (the original `AnnotatedSchemaObject`). */
export interface AnnotatedSchema {
  readonly const?: unknown;
  readonly default?: unknown;
  readonly deprecated?: boolean;
  readonly description?: string;
  readonly enum?: unknown[];
  readonly example?: unknown;
  readonly examples?: unknown;
  readonly format?: string;
  readonly nullable?: boolean;
  readonly summary?: string;
  readonly title?: string;
  readonly type?: string | string[];
}

const LINE_BREAK_RE = /\r?\n/g;
/** Continuation lines of a multi-line value are indented under the tag. */
const CONTINUATION = "\n *     ";
const COMMENT_END_RE = /\*\//g;
/** Tags written as `@tag value`; an empty string is kept only where it is a meaningful value. */
const VALUE_TAGS = ["description", "default", "example"] as const;
const TAGS_KEEPING_EMPTY_STRING: ReadonlySet<string> = new Set(["default", "example"]);
const JSON_INDENT = 2;

function formatValue(value: unknown): string {
  const text = typeof value === "object" ? JSON.stringify(value, null, JSON_INDENT) : value;
  return String(text).trim().replace(LINE_BREAK_RE, CONTINUATION);
}

function plainLines(schema: AnnotatedSchema): string[] {
  const lines: string[] = [];
  for (const text of [schema.title, schema.summary]) {
    if (text) {
      lines.push(text.trim().replace(LINE_BREAK_RE, CONTINUATION));
    }
  }
  if (schema.format) {
    lines.push(`Format: ${schema.format}`);
  }
  if (schema.deprecated) {
    lines.push("@deprecated");
  }
  return lines;
}

function valueTagLines(schema: AnnotatedSchema): string[] {
  const lines: string[] = [];
  for (const tag of VALUE_TAGS) {
    const value = schema[tag];
    if (value === undefined || (value === "" && !TAGS_KEEPING_EMPTY_STRING.has(tag))) {
      continue;
    }
    lines.push(`@${tag} ${formatValue(value)}`);
  }
  if (Array.isArray(schema.examples)) {
    lines.push(...schema.examples.map((example: unknown) => `@example ${formatValue(example)}`));
  }
  return lines;
}

function enumTypeName(schema: AnnotatedSchema): string {
  if (Array.isArray(schema.type)) {
    return schema.type.join("|");
  }
  return typeof schema.type === "string" ? schema.type : "unknown";
}

function constantAndEnumLines(schema: AnnotatedSchema): string[] {
  const lines: string[] = [];
  if ("const" in schema) {
    lines.push("@constant");
  }
  if (schema.enum) {
    lines.push(`@enum {${enumTypeName(schema)}${schema.nullable ? "|null" : ""}}`);
  }
  return lines;
}

/**
 * The JSDoc comment the original writes for a schema (`addJSDocComment`): title, summary and format,
 * then `@deprecated`, `@description`, `@default`, `@example`, `@constant` and `@enum` tags. One short
 * line stays on the `/**` line; anything else is a block. Returns null when there is nothing to say,
 * or when the value is not a schema object.
 */
export function schemaComment(schema: unknown): IrComment | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const annotated = schema as AnnotatedSchema;
  const lines = [
    ...plainLines(annotated),
    ...valueTagLines(annotated),
    ...constantAndEnumLines(annotated),
  ];
  if (lines.length === 0) {
    return null;
  }
  const isSingleLine = lines.length === 1 && !lines.some((line) => line.includes("\n"));
  const text = isSingleLine ? `* ${lines.join("\n")} ` : `*\n * ${lines.join("\n * ")}\n `;
  // A `*/` inside a value would end the comment early.
  return { kind: "block", text: text.replace(COMMENT_END_RE, "*\\/") };
}

/** The property with the schema's JSDoc added after the comments it already has. */
export function withSchemaComment(
  property: IrPropertySignature,
  schema: unknown,
): IrPropertySignature {
  const comment = schemaComment(schema);
  return comment === null ? property : { ...property, comments: [...property.comments, comment] };
}
