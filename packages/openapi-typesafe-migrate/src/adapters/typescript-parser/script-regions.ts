import ts from "@typescript/typescript6";

/** A part of a file that is a script, and where it starts in the file. */
export interface ScriptRegion {
  readonly offset: number;
  readonly text: string;
  readonly kind: ts.ScriptKind;
}

const SCRIPT_KINDS: ReadonlyMap<string, ts.ScriptKind> = new Map([
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
]);

const ASTRO_EXTENSION = ".astro";
const MDX_EXTENSION = ".mdx";
/** An MDX ESM block starts with `import` or `export` at the start of a line. */
const MDX_ESM_START_RE = /^(?:import|export)\b/;
/** A Markdown code fence: three or more backticks or tildes, indented by at most 3 spaces. */
const CODE_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const MDX_KIND = ts.ScriptKind.JSX;
const SCRIPT_OPEN_TAG = "<script";
const TAG_END = ">";
/** Astro's component script: the fenced block at the top of the file. */
const ASTRO_FRONTMATTER_RE = /^(\s*---\r?\n)([\s\S]*?)\r?\n---/;
const LANG_RE = /\blang\s*=\s*["']?([a-z]+)/i;
const LANG_KINDS: ReadonlyMap<string, ts.ScriptKind> = new Map([
  ["ts", ts.ScriptKind.TS],
  ["typescript", ts.ScriptKind.TS],
  ["tsx", ts.ScriptKind.TSX],
  ["jsx", ts.ScriptKind.JSX],
]);

function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf("."));
}

/** The script kind of a plain script file, or undefined for anything else. */
export function plainScriptKind(path: string): ts.ScriptKind | undefined {
  return SCRIPT_KINDS.get(extensionOf(path));
}

/** Astro scripts are TypeScript; Vue and Svelte scripts are JavaScript unless `lang` says not. */
function blockKind(attributes: string, isAstro: boolean): ts.ScriptKind {
  const lang = LANG_RE.exec(attributes)?.[1]?.toLowerCase();
  const fallback = isAstro ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return (lang === undefined ? undefined : LANG_KINDS.get(lang)) ?? fallback;
}

/** Astro's frontmatter, and where the markup after it starts; the markup is the whole text else. */
function astroFrontmatter(text: string): { region?: ScriptRegion; markupStart: number } {
  const frontmatter = ASTRO_FRONTMATTER_RE.exec(text);
  if (frontmatter === null) {
    return { markupStart: 0 };
  }
  const [whole, fence, content] = frontmatter as unknown as [string, string, string];
  const region = { offset: fence.length, text: content, kind: ts.ScriptKind.TS };
  return { region, markupStart: whole.length };
}

/** A `<script>` block of component markup: its attributes, and its content and where it starts. */
interface ScriptBlock {
  readonly attributes: string;
  readonly contentStart: number;
  readonly content: string;
}

/**
 * The `<script>` blocks of a Vue, Svelte or Astro component, each up to the first closing tag
 * after it. Searches from left to right that never go back, not one regular expression with a
 * lazy body: that one scanned the rest of the file again from every unclosed tag, which took
 * seconds on a crafted file. When a tag or a block is not closed, no later one is either.
 */
function scriptBlocks(markup: string): ScriptBlock[] {
  const openTag = /<script\b/gi;
  const closeTag = /<\/script\s*>/gi;
  const blocks: ScriptBlock[] = [];
  for (let opening = openTag.exec(markup); opening !== null; opening = openTag.exec(markup)) {
    const tagEnd = markup.indexOf(TAG_END, opening.index);
    closeTag.lastIndex = tagEnd + 1;
    const closing = tagEnd === -1 ? null : closeTag.exec(markup);
    if (closing === null) {
      break;
    }
    const attributes = markup.slice(opening.index + SCRIPT_OPEN_TAG.length, tagEnd);
    blocks.push({
      attributes,
      contentStart: tagEnd + 1,
      content: markup.slice(tagEnd + 1, closing.index),
    });
    openTag.lastIndex = closeTag.lastIndex;
  }
  return blocks;
}

function componentRegions(text: string, isAstro: boolean): ScriptRegion[] {
  const { region, markupStart } = isAstro ? astroFrontmatter(text) : { markupStart: 0 };
  const regions: ScriptRegion[] = region === undefined ? [] : [region];
  // Script blocks are read in the markup only: a "<script>" string in the frontmatter is code, and
  // a block found there would overlap the frontmatter, so its strings would be edited twice.
  for (const block of scriptBlocks(text.slice(markupStart))) {
    const offset = markupStart + block.contentStart;
    regions.push({ offset, text: block.content, kind: blockKind(block.attributes, isAstro) });
  }
  return regions;
}

/** Whether a line closes the code fence `fence` opened: the same mark, at least as long. */
function closesFence(line: string, fence: string): boolean {
  const mark = CODE_FENCE_RE.exec(line)?.[1];
  return mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length;
}

/**
 * The ESM blocks of an MDX file: from a line that starts with `import` or `export`, outside a
 * code fence, up to the next blank line (MDX reads them as JavaScript, JSX allowed).
 */
function mdxRegions(text: string): ScriptRegion[] {
  const regions: ScriptRegion[] = [];
  let fence: string | undefined;
  let block: { start: number; end: number } | undefined;
  let offset = 0;
  for (const line of text.split("\n")) {
    const end = offset + line.length;
    if (block !== undefined && line.trim() === "") {
      regions.push({
        offset: block.start,
        text: text.slice(block.start, block.end),
        kind: MDX_KIND,
      });
      block = undefined;
    } else if (block !== undefined) {
      block.end = end;
    } else if (fence !== undefined) {
      fence = closesFence(line, fence) ? undefined : fence;
    } else if (MDX_ESM_START_RE.test(line)) {
      block = { start: offset, end };
    } else {
      fence = CODE_FENCE_RE.exec(line)?.[1];
    }
    offset = end + 1;
  }
  if (block !== undefined) {
    regions.push({ offset: block.start, text: text.slice(block.start, block.end), kind: MDX_KIND });
  }
  return regions;
}

/**
 * The scripts of a file: the whole file for a plain script, the `<script>` blocks (and Astro's
 * frontmatter) for a single-file component, the ESM blocks of MDX. Markup is not a script and is
 * left out.
 */
export function scriptRegions(text: string, path: string): ScriptRegion[] {
  const kind = plainScriptKind(path);
  if (kind !== undefined) {
    return [{ offset: 0, text, kind }];
  }
  const extension = extensionOf(path);
  if (extension === MDX_EXTENSION) {
    return mdxRegions(text);
  }
  return componentRegions(text, extension === ASTRO_EXTENSION);
}
