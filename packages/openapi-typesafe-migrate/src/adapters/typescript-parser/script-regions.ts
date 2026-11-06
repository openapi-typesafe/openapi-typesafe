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
/** The `<script>` blocks of a Vue, Svelte or Astro component: attributes, then the content. */
const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
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

function componentRegions(text: string, isAstro: boolean): ScriptRegion[] {
  const regions: ScriptRegion[] = [];
  const frontmatter = isAstro ? ASTRO_FRONTMATTER_RE.exec(text) : null;
  if (frontmatter !== null) {
    const [, fence, content] = frontmatter as unknown as [string, string, string];
    regions.push({ offset: fence.length, text: content, kind: ts.ScriptKind.TS });
  }
  for (const match of text.matchAll(SCRIPT_BLOCK_RE)) {
    const [whole, attributes, content] = match as unknown as [string, string, string];
    const offset = match.index + whole.indexOf(">") + 1;
    regions.push({ offset, text: content, kind: blockKind(attributes, isAstro) });
  }
  return regions;
}

/**
 * The scripts of a file: the whole file for a plain script, the `<script>` blocks (and Astro's
 * frontmatter) for a single-file component. Component markup is not a script and is left out.
 */
export function scriptRegions(text: string, path: string): ScriptRegion[] {
  const kind = plainScriptKind(path);
  if (kind !== undefined) {
    return [{ offset: 0, text, kind }];
  }
  return componentRegions(text, extensionOf(path) === ASTRO_EXTENSION);
}
