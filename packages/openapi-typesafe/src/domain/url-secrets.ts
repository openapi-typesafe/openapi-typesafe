/**
 * URLs can reach a message: the CLI input, a `$ref`, a redirect. Messages end up in CI job logs, so
 * the parts of a URL that carry secrets are hidden in every one (audit B2, F12): the user info
 * (`https://user:token@host/…`), which fetch refuses anyway, and the query, which holds API keys
 * and signatures (`?api_key=…`, `?X-Amz-Signature=…`). Which query parameters are secret cannot be
 * told by their names, so the whole query is hidden; the path and the fragment (a JSON pointer)
 * stay, so the message still names the document and the place in it.
 */

/**
 * A URL in a message, from its `://` to the first space, quote or angle bracket: a serialized URL
 * percent-encodes these, and messages put them around a URL. A match takes the rest of the URL,
 * also a later `://` in it, so the scan never starts again inside a URL; it stays linear. It ends
 * before punctuation that closes a sentence or a parenthesis (`… x.yaml?key=1: 404`, `(… ?key=1)`),
 * which the message puts after the URL; a hidden query would hide it too.
 */
const URL_AFTER_SCHEME = /:\/\/[^\s"'<>]*[^\s"'<>.,:;!?)]/g;

const SCHEME_SEPARATOR = "://";
const AUTHORITY_END = /[/?#]/;
const QUERY_OR_FRAGMENT = /[?#]/;
const QUERY_START = "?";
const FRAGMENT_START = "#";
const USER_INFO_END = "@";
const HIDDEN = "***";

/** The part after `://` with the user info of its authority hidden: `***@host`. */
function withoutUserInfo(rest: string): string {
  const authorityEnd = rest.search(AUTHORITY_END);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const userInfoEnd = authority.lastIndexOf(USER_INFO_END);
  return userInfoEnd === -1 ? rest : `${HIDDEN}${rest.slice(userInfoEnd)}`;
}

/** The part after `://` with its query hidden: `/x.yaml?***#/a`. */
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

/** A URL, or its part from `://` on, with its user info and its query replaced by `***`. */
function redactParsedUrl(url: string): string {
  const separator = url.indexOf(SCHEME_SEPARATOR);
  const rest = url.slice(separator + SCHEME_SEPARATOR.length);
  return `${url.slice(0, separator)}${SCHEME_SEPARATOR}${withoutQuery(withoutUserInfo(rest))}`;
}

/** The text with the user info and the query of every URL in it replaced by `***`. */
export function redactUrlSecrets(text: string): string {
  return text.replace(URL_AFTER_SCHEME, redactParsedUrl);
}

/**
 * Text that is one location, a URL as a `$ref` wrote it or a path, with what may be secret
 * hidden. Unlike `redactUrlSecrets` it hides the query also after a space or a quote, which end a
 * URL in a message but which Redocly keeps in a `$ref` URL as written
 * (`http://host/my pet.yaml?key=…`). A URL that does not parse is read as `redactUnparsedUrl`
 * reads it; text without `://` (a path) stays as it is.
 */
export function redactLocationSecrets(location: string): string {
  // A drive path (`C:/specs/pet.yaml`) parses as a URL too, but has no authority to hide.
  if (!location.includes(SCHEME_SEPARATOR)) {
    return location;
  }
  return URL.canParse(location) ? redactParsedUrl(location) : redactUnparsedUrl(location);
}

/**
 * Text that starts like a URL but does not parse as one (`http://user:a/b@host/x`), with what may
 * be secret hidden. Without a parse there is no telling where the authority ends, so everything
 * from the `://` to the last `@` before the query counts as user info; the query is hidden as in
 * `redactUrlSecrets`.
 */
export function redactUnparsedUrl(text: string): string {
  const separator = text.indexOf(SCHEME_SEPARATOR);
  if (separator === -1) {
    return text;
  }
  const rest = text.slice(separator + SCHEME_SEPARATOR.length);
  const queryOrFragment = rest.search(QUERY_OR_FRAGMENT);
  const beforeQuery = queryOrFragment === -1 ? rest : rest.slice(0, queryOrFragment);
  const userInfoEnd = beforeQuery.lastIndexOf(USER_INFO_END);
  const shown = userInfoEnd === -1 ? rest : `${HIDDEN}${rest.slice(userInfoEnd)}`;
  return `${text.slice(0, separator)}${SCHEME_SEPARATOR}${withoutQuery(shown)}`;
}
