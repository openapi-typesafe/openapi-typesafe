/**
 * Credentials in URLs (`https://user:password@host`, `git+https://token@host`) that the findings
 * would copy into the report and the log. The project files keep them; only the findings hide
 * them, because a CI log or a temporary log file is a new place for a secret.
 */

const SCHEME_SEPARATOR = "://";
const HIDDEN_USERINFO = "***";
const USERINFO_END = "@";
/** The authority of a URL ends at a path, a query, a fragment, a quote or white space. */
const AUTHORITY_END_RE = /[/?#"'`\s]/;

/** The index where the authority that starts at `start` ends, and its last `@` (or -1). */
function scanAuthority(text: string, start: number): { end: number; userinfoEnd: number } {
  let userinfoEnd = -1;
  let end = start;
  for (; end < text.length && !AUTHORITY_END_RE.test(text.charAt(end)); end++) {
    if (text.charAt(end) === USERINFO_END) {
      userinfoEnd = end;
    }
  }
  return { end, userinfoEnd };
}

/** `text` with the userinfo of every URL in it replaced by `***`. Linear in the text length. */
export function hideUrlCredentials(text: string): string {
  let hidden = "";
  let copiedUpTo = 0;
  for (let found = text.indexOf(SCHEME_SEPARATOR); found !== -1; ) {
    const start = found + SCHEME_SEPARATOR.length;
    const { end, userinfoEnd } = scanAuthority(text, start);
    if (userinfoEnd !== -1) {
      hidden += `${text.slice(copiedUpTo, start)}${HIDDEN_USERINFO}`;
      copiedUpTo = userinfoEnd;
    }
    found = text.indexOf(SCHEME_SEPARATOR, end);
  }
  return `${hidden}${text.slice(copiedUpTo)}`;
}
