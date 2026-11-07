# ADR-033: Remote `$ref` loading is hardened by default

- Status: Accepted
- Date: 2026-11-06

## Context

The security audit before 1.0.0 (B2) found gaps in how the generator loads remote documents.
ADR-017 made the `$ref` limits opt-in, because the limits change which documents load. The gaps
below are different: closing them does not refuse any document a real project relies on, so they
are closed by default. Each one is inherited from openapi-typescript 7.13 and Redocly 1.34.

**Configured headers leak (F1, F11).** Redocly sends the `resolve.http.headers` of `redocly.yaml`
(often an API key) to every URL whose raw text matches a minimatch pattern, and lets fetch follow
redirects.

- Fetch drops only `Authorization`, `Cookie` and `Proxy-Authorization` on a redirect to another
  origin. An `X-Api-Key` went on to the new origin. With `--remote-ref-hosts` the loader already
  followed redirects itself (ADR-017), without it fetch did.
- A `*` matches `?` and `#`, so `*.trusted.example/**` matched
  `https://evil.example?.trusted.example/x.yaml`, a URL of `evil.example`.
- A pattern without a protocol matched `http://` too, so the header could go over plain HTTP.

**A remote document reads local files (F2).** Redocly resolves a `$ref` of a remote document with
`new URL(ref, base)`. `C:/Users/me/x.json` gives `c:/Users/me/x.json`, a URL with the scheme `c:`,
and `file:///etc/x.json` stays a `file:` URL. Redocly fetches only `http(s)` URLs and reads every
other `$ref` from disk: on Windows the first one is an absolute path. The threat model (T3) said a
remote document cannot do this.

**Remote fan-out has no bound (F4).** Nothing limits the number of remote documents or of parallel
fetches. A server that returns documents with 150 `$ref`s each to new URLs, three levels deep, made
one run send 16,212 requests and fail with "fetch failed" when the local ports ran out. With new
URLs at every level it never ends; the `$ref` depth limit does not apply, because each chain is
short.

## Decision

1. **Headers are chosen per request from the parsed URL.** The loader takes the configured headers
   out of the config it gives Redocly and adds them itself, in its fetch, for each request and for
   each redirect hop. A pattern is matched against `protocol//host/path` of the parsed URL: no user
   info, query or fragment. Redocly's own matcher does the matching (`readFileFromUrl` with a fetch
   that only records the headers), so a pattern and an `envVariable` mean what they mean in Redocly.
2. **HTTPS only, unless the pattern says `http://`.** A pattern without a protocol, or with
   `https://`, applies to `https:` URLs only. A pattern that starts with `http://` is an explicit
   choice for a local or internal server and applies to `http:` URLs.
3. **Redirects are always followed by the loader**, with or without a host list, at most 20 (the
   Fetch standard's limit, which applied without a host list before; ADR-017 had 5 with one). A
   hop gets only the headers its own URL matches.
4. **A remote document refers only to URLs.** A `$ref` whose base is an `http(s)` document and that
   does not resolve to an `http(s)` URL is refused before it is read, with `SCHEMA_REF_FORBIDDEN`
   and the reason `local-ref-from-remote`, with or without `--local-ref-root`.
5. **A default bound on remote documents, no option.** One run loads at most 10,000 remote
   documents (the root included; a document is counted once, as Redocly caches it). The next one
   is refused before it is fetched, with `SCHEMA_REF_FORBIDDEN` and the reason
   `too-many-remote-documents`. At most 16 remote documents are fetched at the same time; a
   document's redirects share its slot. Local files are not counted: the file system bounds them.
   - ADR-017 made its limits opt-in because real documents rely on what they refuse. No real
     document relies on more than 10,000 remote files: the largest split documents we know have a
     few thousand files, and a run that fetches 10,000 over the network takes minutes. So the bound
     is a default, in the spirit of ADR-021: no working setup breaks.
   - No option to change it, until a report shows a document that needs more (YAGNI). The values
     are injected into the loader (`DEFAULT_REMOTE_DOCUMENT_LIMITS`), so tests use small ones.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Choose headers per hop from the parsed URL (chosen) | One rule for the first request and every redirect; a pattern keeps Redocly's meaning | The loader re-implements the header step of Redocly's fetch |
| Drop all configured headers on any origin change | Simple | A redirect between two hosts that one pattern names (`*.example.com`) loses its credentials |
| Own glob matcher or a direct `minimatch` dependency | No call into Redocly's fetch helper | A second matcher whose edge cases differ from Redocly's; a new runtime dependency (ADR-005) |
| Keep sending headers over HTTP for patterns without a protocol | No change for a dev server whose pattern has no protocol | Credentials in clear text whenever a document or a redirect says `http://` |
| Refuse only drive letters | Closes the Windows case | `file:` and other schemes still become cwd-relative paths; no real remote document refers to the reader's disk |
| Opt-in document limit next to `--remote-ref-hosts` | No default changes | The default run still ends only when the ports run out, or never; T2 claims a default control |
| A lower default bound (1,000) | Fewer requests before the error | Close to the size of real split documents fetched from GitHub |
| Only a concurrency limit | Never refuses a document | An endless fan-out then runs forever instead of failing |
| Opt-in, as in ADR-017 | No change at all | The safe behavior needs a flag no one knows about; the leak is not a feature anyone relies on |

## Consequences

- A `redocly.yaml` whose pattern has no protocol and that loads from a plain HTTP server no longer
  sends that header there. The fix is to write the pattern with `http://`. The changeset and
  docs/cli.md ("Auth") say so.
- A remote document with a `$ref` to a local file no longer loads. No remote document can rely on
  that: the file is on the reader's machine, not the server's.
- A remote multi-file document is fetched 16 files at a time instead of all at once; on a slow
  link this can take longer than before, and it no longer exhausts local ports.
- A redirect chain of 6 to 20 hops now loads with `--remote-ref-hosts`.
- docs/security/threat-model.md lists the headers as T4a and corrects T3.

## Review trigger

The schema loader changes (ADR-005, Redocly 2.x), or Redocly changes `readFileFromUrl`; a report
of a real document with more than 10,000 remote files, or one that loads slower with 16 parallel
fetches.
