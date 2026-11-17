import { hasUrlScheme, urlSchemeOf } from "./location-text.js";

/**
 * URLs can reach a message: the CLI input, a `$ref`, a redirect. Messages end up in CI job logs, so
 * the parts of a URL that carry secrets are hidden in every one (audit B2, F12): the user info
 * (`https://user:token@host/…`), which fetch refuses anyway, and the query, which holds API keys
 * and signatures (`?api_key=…`, `?X-Amz-Signature=…`). Which query parameters are secret cannot be
 * told by their names, so the whole query is hidden; the path and the fragment (a JSON pointer)
 * stay, so the message still names the document and the place in it.
 *
 * A URL is found by the rule the loader reads every location with (`hasUrlScheme`), not by a
 * search for `://`: the loader fetches `http:host/api.yaml` and `http:\\host\api.yaml` too, and
 * the first `://` of such a URL may be in its query (`http:host/x?key=…&next=http://h`).
 */

/**
 * Where a URL may start in a message: a scheme at the start of a run of scheme characters, so a
 * scheme is never read from the middle of a word, or a `://` that no scheme of two or more
 * characters starts (`1http://h`, `a://h`), which a message may still put before a URL.
 */
const URL_START = /(?<![a-z\d+.-])[a-z][a-z\d+.-]+:|:\/\//gi;

/**
 * The rest of a URL in a message, from its start to the first space, quote or angle bracket: a
 * serialized URL percent-encodes these, and messages put them around a URL. It ends before
 * punctuation that closes a sentence or a parenthesis (`… x.yaml?key=1: 404`, `(… ?key=1)`), which
 * the message puts after the URL; a hidden query would hide it too.
 */
const URL_RUN = /[^\s"'<>]*/y;
const SENTENCE_END: ReadonlySet<string> = new Set([".", ",", ":", ";", "!", "?", ")"]);

const SCHEME_END = ":";
const AUTHORITY_START = "//";
const BARE_AUTHORITY_START = `${SCHEME_END}${AUTHORITY_START}`;

/** Schemes whose authority the URL standard reads after any run of `/` and `\` (`http:\\h`). */
const SPECIAL_SCHEMES: ReadonlySet<string> = new Set([
  "file:",
  "ftp:",
  "http:",
  "https:",
  "ws:",
  "wss:",
]);
const LEADING_SLASHES = /^[/\\]*/;

/** Where the URL standard ends the authority of a URL that parses, by the kind of its scheme. */
const SPECIAL_AUTHORITY_END = /[/\\?#]/;
const AUTHORITY_END = /[/?#]/;
const QUERY_OR_FRAGMENT = /[?#]/;
const QUERY_START = "?";
const FRAGMENT_START = "#";
const USER_INFO_END = "@";
const HIDDEN = "***";

/** A URL as written, split where its authority starts: `http:\\` and `h\x.yaml?key=…`. */
interface WrittenUrl {
  readonly head: string;
  readonly rest: string;
  readonly isSpecial: boolean;
}

/** The URL split after its scheme and the slashes that the URL standard reads before a host. */
function splitAtAuthority(url: string): WrittenUrl {
  const scheme = urlSchemeOf(url) ?? "";
  const isSpecial = SPECIAL_SCHEMES.has(scheme);
  const afterScheme = url.slice(scheme.length);
  const otherSlashes = afterScheme.startsWith(AUTHORITY_START) ? AUTHORITY_START : "";
  const slashes = isSpecial ? (LEADING_SLASHES.exec(afterScheme)?.[0] ?? "") : otherSlashes;
  const headLength = scheme.length + slashes.length;
  return { head: url.slice(0, headLength), rest: url.slice(headLength), isSpecial };
}

/**
 * Where the user info of the authority ends, the index of its last `@`, or -1. A URL that parses
 * has user info only when the parser found some, up to where the URL standard ends its authority.
 * Without a parse there is no telling where the authority ends, so everything to the last `@`
 * before the query counts as user info.
 */
function userInfoEnd(written: WrittenUrl, parsed: URL | null): number {
  if (parsed !== null && parsed.username === "" && parsed.password === "") {
    return -1;
  }
  const parsedEnd = written.isSpecial ? SPECIAL_AUTHORITY_END : AUTHORITY_END;
  const authorityEnd = written.rest.search(parsed === null ? QUERY_OR_FRAGMENT : parsedEnd);
  const authority = authorityEnd === -1 ? written.rest : written.rest.slice(0, authorityEnd);
  return authority.lastIndexOf(USER_INFO_END);
}

/** The part after the authority start with its query hidden: `h/x.yaml?***#/a`. */
function withoutQuery(rest: string): string {
  const fragmentStart = rest.indexOf(FRAGMENT_START);
  const beforeFragment = fragmentStart === -1 ? rest : rest.slice(0, fragmentStart);
  const queryStart = beforeFragment.indexOf(QUERY_START);
  if (queryStart === -1) {
    return rest;
  }
  const fragment = fragmentStart === -1 ? "" : rest.slice(fragmentStart);
  return `${rest.slice(0, queryStart + 1)}${HIDDEN}${fragment}`;
}

/** A URL as written with its user info and its query replaced by `***`. */
function redactWrittenUrl(url: string, parsed: URL | null): string {
  const written = splitAtAuthority(url);
  const end = userInfoEnd(written, parsed);
  const shown = end === -1 ? written.rest : `${HIDDEN}${written.rest.slice(end)}`;
  return `${written.head}${withoutQuery(shown)}`;
}

/** One URL as written, read as the URL parser reads it when it parses, else as unparsed text. */
function redactUrlText(url: string): string {
  return redactWrittenUrl(url, URL.parse(url));
}

/** Whether a URL starts at `index` of the text: a scheme by the loader's rule, or a `://`. */
function isUrlStart(text: string, start: string, index: number): boolean {
  if (start === BARE_AUTHORITY_START) {
    return true;
  }
  // The scheme and the two characters after it are all that the rule reads; a longer slice for
  // each candidate would make the scan quadratic.
  return hasUrlScheme(text.slice(index, index + start.length + AUTHORITY_START.length));
}

/**
 * Where the URL that starts at `start` of a message ends: after its run of URL characters, less the
 * sentence punctuation at the end of that run. Read in two linear steps, not by one pattern that
 * ends the run on a character class, which would backtrack over a long run of punctuation.
 */
function urlEnd(text: string, start: number): number {
  URL_RUN.lastIndex = start;
  URL_RUN.exec(text);
  let end = URL_RUN.lastIndex;
  // A URL starts with a scheme letter or the `/` after a bare `:`, so the loop stops at its start.
  while (SENTENCE_END.has(text.charAt(end - 1))) {
    end--;
  }
  return end;
}

/** The URL that starts at `index` of a message, with its secrets hidden, and where it ends. */
function redactUrlAt(text: string, index: number, start: string): { shown: string; end: number } {
  // A bare `://` keeps its colon outside the URL, so the rest reads as an authority after `//`.
  const urlStart = start === BARE_AUTHORITY_START ? index + SCHEME_END.length : index;
  const end = urlEnd(text, urlStart);
  const url = redactUrlText(text.slice(urlStart, end));
  return { shown: `${text.slice(index, urlStart)}${url}`, end };
}

/** The text with the user info and the query of every URL in it replaced by `***`. */
export function redactUrlSecrets(text: string): string {
  let shown = "";
  let shownUpTo = 0;
  for (const match of text.matchAll(URL_START)) {
    // A candidate inside a URL already shown is part of that URL (`?next=http://h`).
    if (match.index < shownUpTo || !isUrlStart(text, match[0], match.index)) {
      continue;
    }
    const url = redactUrlAt(text, match.index, match[0]);
    shown += `${text.slice(shownUpTo, match.index)}${url.shown}`;
    shownUpTo = url.end;
  }
  return `${shown}${text.slice(shownUpTo)}`;
}

/**
 * Text that is one location, a URL as a `$ref` wrote it or a path, with what may be secret
 * hidden. Unlike `redactUrlSecrets` it hides the query also after a space or a quote, which end a
 * URL in a message but which Redocly keeps in a `$ref` URL as written
 * (`http://host/my pet.yaml?key=…`). A location is a URL by the rule the loader reads it with
 * (`hasUrlScheme`), so `http:host/x?key=…` is one; any other text is a path and stays as it is.
 */
export function redactLocationSecrets(location: string): string {
  return hasUrlScheme(location) ? redactUrlText(location) : location;
}

/**
 * A location written as a URL that does not parse (`http://user:a/b@host/x`), with what may be
 * secret hidden: everything from the start of its authority to the last `@` before the query
 * counts as user info, and the query is hidden as in `redactUrlSecrets`. Text that is no URL by
 * the loader's rule stays as it is.
 */
export function redactUnparsedUrl(text: string): string {
  return hasUrlScheme(text) ? redactWrittenUrl(text, null) : text;
}
