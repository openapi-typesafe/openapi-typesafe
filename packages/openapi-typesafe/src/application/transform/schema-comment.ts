import type { IrComment, IrPropertySignature } from "../../domain/ir/nodes.js";
import { OutputFix } from "../../domain/output-fixes.js";

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
/** The member lists whose descriptions `anyof-oneof-descriptions` adds, with their headings. */
const MEMBER_LISTS = [
  ["anyOf", "Any of:"],
  ["oneOf", "One of:"],
] as const;
/** The later lines of a member's description are indented under its bullet. */
const BULLET_CONTINUATION = "\n  ";

/** How a schema's JSDoc is written. */
export interface SchemaCommentOptions {
  /** `anyof-oneof-descriptions`: the descriptions of `anyOf` and `oneOf` members are listed. */
  readonly hasMemberDescriptions: boolean;
}

/** The JSDoc the original writes. */
export const ORIGINAL_SCHEMA_COMMENT: SchemaCommentOptions = { hasMemberDescriptions: false };

/** How the fixes turned on write a schema's JSDoc. */
export function schemaCommentOptionsOf(fixes: ReadonlySet<OutputFix>): SchemaCommentOptions {
  return { hasMemberDescriptions: fixes.has(OutputFix.ANYOF_ONEOF_DESCRIPTIONS) };
}

function formatValue(value: unknown): string {
  const text = typeof value === "object" ? JSON.stringify(value, null, JSON_INDENT) : value;
  return String(text).trim().replace(LINE_BREAK_RE, CONTINUATION);
}

function plainLines(schema: AnnotatedSchema): string[] {
  const lines: string[] = [];
  for (const text of [schema.title, schema.summary]) {
    // The document is not validated against the schema dialect: a property named `summary`
    // written without `properties:` makes `summary` an object (upstream #2349).
    if (typeof text === "string" && text) {
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

/** The own, non-blank `description` of each member; a member without one is left out. */
function memberDescriptions(members: unknown): string[] {
  if (!Array.isArray(members)) {
    return [];
  }
  return members.flatMap((member: unknown) => {
    const description = isSchemaObject(member) ? member.description : undefined;
    return typeof description === "string" && description.trim() !== "" ? [description.trim()] : [];
  });
}

/** Each member list with a described member, as a heading and one bullet per description. */
function memberDescriptionLists(schema: SchemaRecord): string[] {
  return MEMBER_LISTS.flatMap(([keyword, heading]) => {
    const descriptions = memberDescriptions(schema[keyword]);
    if (descriptions.length === 0) {
      return [];
    }
    const bullets = descriptions.map(
      (description) => `- ${description.replace(LINE_BREAK_RE, BULLET_CONTINUATION)}`,
    );
    return [[heading, ...bullets].join("\n")];
  });
}

/**
 * The schema with the descriptions of its `anyOf` and `oneOf` members after its own description
 * (upstream #2142). A member's description holds only where that member applies, so each one is
 * listed under its keyword rather than merged into one sentence. A `description` that is not a
 * string is kept as it is.
 */
function withMemberDescriptions(schema: SchemaRecord): AnnotatedSchema {
  const lists = memberDescriptionLists(schema);
  const own = schema.description;
  if (lists.length === 0 || (own !== undefined && typeof own !== "string")) {
    // As the original, the keywords are read as they are, without validating them.
    return schema as AnnotatedSchema;
  }
  const ownLines = typeof own === "string" && own.trim() !== "" ? [own.trim()] : [];
  return { ...(schema as AnnotatedSchema), description: [...ownLines, ...lists].join("\n") };
}

/** A schema object read without knowing its keywords. */
interface SchemaRecord {
  readonly description?: unknown;
  readonly [keyword: string]: unknown;
}

function isSchemaObject(value: unknown): value is SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The JSDoc comment the original writes for a schema (`addJSDocComment`): title, summary and
 * format, then `@deprecated`, `@description`, `@default`, `@example`, `@constant` and `@enum`
 * tags. One short line stays on the `/**` line; anything else is a block. Returns null when there
 * is nothing to say, or when the value is not a schema object.
 */
export function schemaComment(
  schema: unknown,
  options: SchemaCommentOptions = ORIGINAL_SCHEMA_COMMENT,
): IrComment | null {
  if (!isSchemaObject(schema)) {
    return null;
  }
  const annotated = options.hasMemberDescriptions
    ? withMemberDescriptions(schema)
    : (schema as AnnotatedSchema);
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
  options: SchemaCommentOptions = ORIGINAL_SCHEMA_COMMENT,
): IrPropertySignature {
  const comment = schemaComment(schema, options);
  return comment === null ? property : { ...property, comments: [...property.comments, comment] };
}
