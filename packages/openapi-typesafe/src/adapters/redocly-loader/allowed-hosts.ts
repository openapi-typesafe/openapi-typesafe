/**
 * Matching URLs against the `--remote-ref-hosts` list (threat model R2, ADR-017). Both sides are
 * compared as the WHATWG URL parser writes hosts (lower case, Punycode, dotted IPv4, compressed
 * IPv6 in brackets), so `bücher.example`, `::1` and `api.example.com.` match the hosts they name.
 */

const DEFAULT_PORTS: Readonly<Record<string, string>> = { "http:": "80", "https:": "443" };
const FULLY_QUALIFIED_DOT = /\.$/;
const PORT_SUFFIX = /:(\d+)$/;
/** Characters that end a host in a URL: an entry with them would match a different host. */
const NOT_A_HOST = /[/?#@\\]/;

interface HostEntry {
  readonly hostname: string;
  /** Undefined when the entry allows any port. */
  readonly port: string | undefined;
}

/** A bare IPv6 address has two colons or more and cannot carry a port; brackets add one. */
function withBrackets(entry: string): string {
  const isBareIPv6 = !entry.startsWith("[") && entry.split(":").length > 2;
  return isBareIPv6 ? `[${entry}]` : entry;
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(FULLY_QUALIFIED_DOT, "");
}

function portOf(url: URL): string {
  return url.port === "" ? (DEFAULT_PORTS[url.protocol] ?? "") : url.port;
}

/** The written port without leading zeros, as the URL parser writes it; undefined when none. */
function writtenPort(entry: string): string | undefined {
  const match = PORT_SUFFIX.exec(entry);
  return match === null ? undefined : String(Number(match[1]));
}

/** The entry as the URL parser reads it, or undefined when it is not a bare host or host:port. */
function parseHostEntry(entry: string): HostEntry | undefined {
  const written = withBrackets(entry.trim());
  const candidate = `http://${written}`;
  if (written === "" || NOT_A_HOST.test(written) || !URL.canParse(candidate)) {
    return undefined;
  }
  // The port is read from the text: the parser drops a default port (`:80`), which must still
  // limit the entry to that port.
  return { hostname: hostnameOf(new URL(candidate)), port: writtenPort(written) };
}

/** Whether the URL's host is listed, by host name alone (any port) or with its port. */
export function isHostAllowed(url: URL, hosts: readonly string[]): boolean {
  const hostname = hostnameOf(url);
  if (hostname === "") {
    return false;
  }
  const port = portOf(url);
  return hosts.map(parseHostEntry).some((entry) => {
    const isAnyPort = entry?.port === undefined;
    return entry?.hostname === hostname && (isAnyPort || entry.port === port);
  });
}
