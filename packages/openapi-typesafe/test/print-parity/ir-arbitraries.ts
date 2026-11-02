import fc from "fast-check";
import type {
  IrComment,
  IrDeclaration,
  IrKeyword,
  IrMember,
  IrPropertyName,
  IrType,
} from "../../src/domain/ir/nodes.js";

/**
 * fast-check generators of IR trees for the printer property tests. Raw declarations are excluded:
 * TypeScript re-formats parsed code, while the printer writes raw text as given, by design.
 */

const KEYWORDS: readonly IrKeyword[] = [
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "unknown",
  "never",
];

/** Any UTF-16 string, including lone surrogates, control and line-break characters. */
export const arbitraryText = fc.string({
  unit: fc.oneof(
    fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code)),
    fc.constantFrom("\n", "\r", "\t", " ", "*", " "),
  ),
  maxLength: 24,
});

export const arbitraryIdentifier = fc.stringMatching(/^[A-Za-z_$][A-Za-z_$0-9]{0,8}$/);

const arbitraryNumber = fc.double({ noNaN: true, noDefaultInfinity: true });

const arbitraryComment: fc.Arbitrary<IrComment> = fc.oneof(
  arbitraryText
    .filter((text) => !text.includes("*/"))
    .map((text): IrComment => ({ kind: "block", text: `*${text}` })),
  arbitraryText.map((text): IrComment => ({ kind: "line", text })),
);

/** Mostly no comment; sometimes one or two, which TypeScript prints in order. */
const arbitraryComments: fc.Arbitrary<readonly IrComment[]> = fc.oneof(
  { weight: 3, arbitrary: fc.constant([]) },
  { weight: 1, arbitrary: fc.array(arbitraryComment, { minLength: 1, maxLength: 2 }) },
);

const arbitraryPropertyName: fc.Arbitrary<IrPropertyName> = fc.oneof(
  arbitraryIdentifier.map((text): IrPropertyName => ({ kind: "identifier", text })),
  arbitraryText.map((value): IrPropertyName => ({ kind: "string", value })),
  fc.nat().map((value): IrPropertyName => ({ kind: "number", text: String(value) })),
);

const { type: arbitraryType, member: arbitraryMember } = fc.letrec<{
  type: IrType;
  member: IrMember;
}>((tie) => ({
  type: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom(...KEYWORDS).map((keyword): IrType => ({ kind: "keyword", keyword })),
    fc.record({
      kind: fc.constant("stringLiteral" as const),
      value: arbitraryText,
      encoding: fc.constantFrom("json" as const, "escaped" as const),
    }),
    fc.record({ kind: fc.constant("numberLiteral" as const), value: arbitraryNumber }),
    fc.record({ kind: fc.constant("booleanLiteral" as const), value: fc.boolean() }),
    fc.record({ kind: fc.constant("raw" as const), text: arbitraryIdentifier }),
    fc.record({
      kind: fc.constant("reference" as const),
      name: arbitraryIdentifier,
      typeArguments: fc.array(tie("type"), { maxLength: 2 }),
    }),
    fc.record({ kind: fc.constant("array" as const), element: tie("type") }),
    fc.record({
      kind: fc.constant("tuple" as const),
      elements: fc.array(fc.record({ type: tie("type"), isRest: fc.boolean() }), { maxLength: 3 }),
    }),
    // Never empty: the original builds unions with `tsUnion`, which returns `never` for no members,
    // and the TypeScript printer itself fails on an empty union inside a tuple.
    fc.record({
      kind: fc.constant("union" as const),
      types: fc.array(tie("type"), { minLength: 1, maxLength: 3 }),
    }),
    fc.record({
      kind: fc.constant("intersection" as const),
      types: fc.array(tie("type"), { minLength: 1, maxLength: 3 }),
    }),
    fc.record({
      kind: fc.constant("object" as const),
      members: fc.array(tie("member"), { maxLength: 3 }),
    }),
    fc.record({
      kind: fc.constant("indexedAccess" as const),
      object: tie("type"),
      index: tie("type"),
    }),
    fc.record({ kind: fc.constant("readonly" as const), type: tie("type") }),
  ) as fc.Arbitrary<IrType>,
  member: fc.oneof(
    fc.record({
      kind: fc.constant("property" as const),
      name: arbitraryPropertyName,
      type: tie("type"),
      isOptional: fc.boolean(),
      isReadonly: fc.boolean(),
      comments: arbitraryComments,
    }),
    fc.record({
      kind: fc.constant("indexSignature" as const),
      parameterName: arbitraryIdentifier,
      parameterType: tie("type"),
      type: tie("type"),
      isReadonly: fc.boolean(),
      comments: arbitraryComments,
    }),
  ) as fc.Arbitrary<IrMember>,
}));

export { arbitraryType };

const arbitraryValue = fc.oneof(arbitraryText, arbitraryNumber);

const arbitraryDeclaration: fc.Arbitrary<IrDeclaration> = fc.oneof(
  fc.record({
    kind: fc.constant("interface" as const),
    name: arbitraryIdentifier,
    isExported: fc.boolean(),
    members: fc.array(arbitraryMember, { maxLength: 3 }),
    comments: arbitraryComments,
  }),
  fc.record({
    kind: fc.constant("typeAlias" as const),
    name: arbitraryIdentifier,
    isExported: fc.boolean(),
    type: arbitraryType,
    comments: arbitraryComments,
  }),
  fc.record({
    kind: fc.constant("enum" as const),
    name: arbitraryIdentifier,
    isExported: fc.boolean(),
    members: fc.array(
      fc.record({ name: arbitraryIdentifier, value: arbitraryValue, comments: arbitraryComments }),
      {
        maxLength: 3,
      },
    ),
    comments: arbitraryComments,
  }),
  fc.record({
    kind: fc.constant("constArray" as const),
    name: arbitraryIdentifier,
    isExported: fc.boolean(),
    type: arbitraryType,
    values: fc.array(arbitraryValue, { maxLength: 3 }),
    comments: arbitraryComments,
  }),
);

export const arbitraryDeclarations = fc.array(arbitraryDeclaration, { maxLength: 3 });
