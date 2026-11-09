import {
  CST,
  type Document,
  isPair,
  isScalar,
  isSeq,
  type Node,
  type Pair,
  parseAllDocuments,
  Scalar,
  visit,
} from "yaml";
import type { YamlDocumentReader } from "../../application/ports.js";
import type { DocumentPath, YamlString } from "../../domain/config-documents.js";

/**
 * The YamlDocumentReader port on the `yaml` package (ADR-015). It keeps the source tokens, so
 * each scalar has the offsets of its text as written, in block and flow style alike.
 */

type Ancestor = Document | Node | Pair;

/** The key path of a node from its ancestors; undefined below a key that is not a scalar. */
function keyPath(chain: readonly Ancestor[]): DocumentPath | undefined {
  const path: (string | number)[] = [];
  for (const [index, parent] of chain.entries()) {
    if (isPair(parent)) {
      if (!isScalar(parent.key)) {
        return undefined;
      }
      path.push(String(parent.key.value));
    } else if (isSeq(parent)) {
      path.push(parent.items.indexOf(chain[index + 1]));
    }
  }
  return path;
}

interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** The content lines of a block scalar follow its header line, which its props make up. */
function blockContent(token: CST.BlockScalar): TextRange {
  const headerLength = token.props.reduce((length, prop) => length + CST.stringify(prop).length, 0);
  const start = token.offset + headerLength;
  return { start, end: start + token.source.trimEnd().length };
}

/** The text of a scalar as written: without quotes, and without the header of a block scalar. */
function contentRange(token: CST.Token | undefined): TextRange | undefined {
  switch (token?.type) {
    case "scalar":
      return { start: token.offset, end: token.offset + token.source.length };
    case "single-quoted-scalar":
    case "double-quoted-scalar":
      return { start: token.offset + 1, end: token.offset + token.source.length - 1 };
    case "block-scalar":
      return blockContent(token);
    default:
      return undefined;
  }
}

function yamlString(node: Scalar, ancestors: readonly Ancestor[]): YamlString | undefined {
  const path = keyPath([...ancestors, node]);
  const range = contentRange(node.srcToken);
  if (typeof node.value !== "string" || path === undefined || range === undefined) {
    return undefined;
  }
  const isFolded = node.type !== Scalar.BLOCK_LITERAL;
  return { path, value: node.value, ...range, isFolded };
}

function yamlStrings(text: string): YamlString[] | undefined {
  const documents = parseAllDocuments(text, { keepSourceTokens: true });
  if (documents.some((document) => document.errors.length > 0)) {
    return undefined;
  }
  const strings: YamlString[] = [];
  for (const document of documents) {
    visit(document, {
      Scalar: (key, node, ancestors) => {
        const found = key === "key" ? undefined : yamlString(node, ancestors);
        if (found !== undefined) {
          strings.push(found);
        }
      },
    });
  }
  return strings;
}

export function createYamlTextReader(): YamlDocumentReader {
  return { strings: yamlStrings };
}
