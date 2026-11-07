/**
 * URLs with user info (`https://user:token@host/…`) can reach a message: the CLI input, a `$ref`,
 * a redirect. Messages end up in CI job logs, so the user info is hidden in every one (audit B2,
 * F12). Fetch refuses such URLs anyway, so a message never needs the credentials.
 */

/**
 * The user info after a scheme: everything up to an `@` that comes before the end of the
 * authority. The class stops at `/`, so a scan never runs past the next `://`; it stays linear.
 */
const URL_USER_INFO = /:\/\/[^\s/?#@]*@/g;

const REDACTED_USER_INFO = "://***@";

/** The text with the user info of every URL in it replaced by `***`. */
export function redactUrlCredentials(text: string): string {
  return text.replace(URL_USER_INFO, () => REDACTED_USER_INFO);
}
