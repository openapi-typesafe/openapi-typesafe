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
 * also a later `://` in it, so the scan never starts again inside a URL; it stays linear.
 */
const URL_AFTER_SCHEME = /:\/\/[^\s"'<>]*/g;

const SCHEME_SEPARATOR = "://";
const AUTHORITY_END = /[/?#]/;
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

/** The text with the user info and the query of every URL in it replaced by `***`. */
export function redactUrlSecrets(text: string): string {
  return text.replace(URL_AFTER_SCHEME, (url) => {
    const rest = url.slice(SCHEME_SEPARATOR.length);
    return `${SCHEME_SEPARATOR}${withoutQuery(withoutUserInfo(rest))}`;
  });
}
