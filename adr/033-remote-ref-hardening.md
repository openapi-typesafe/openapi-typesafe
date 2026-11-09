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
2. **HTTPS or loopback, unless the pattern says `http://`.** A pattern without a protocol, or with
   `https://`, applies to `https:` URLs and to `http:` URLs of this machine (`localhost`,
   `127.0.0.0/8`, `[::1]`): loopback traffic does not cross the network, and a local dev server
   with a pattern like `localhost:8080/**` keeps working. A pattern that starts with `http://` is
   an explicit choice for an internal server and applies to `http:` URLs of any host.
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

## Amendment (2026-11-08): the decoded size of remote documents is bounded

The review before rc.4 (RC4 S4) found no bound on the size of a remote document. Fetch decodes
`gzip`, `deflate` and `br` before the loader sees the body, and the loader read the body whole:
four documents of 0.4 MB on the wire became 1.6 GB in memory, and larger ones ended the process
with an out-of-memory crash. The threat model called T2 controlled.

6. **Remote bodies are read as a stream, and the decoded bytes are counted while they arrive.**
   Past 256 MiB for one document, or 512 MiB for all remote documents of one load together, the
   read stops, the rest of the body is cancelled, and the load fails with `SCHEMA_REF_FORBIDDEN`
   and the reason `remote-document-too-large` (`details.maxDocumentBytes`) or
   `remote-documents-too-large` (`details.maxTotalBytes`). A `customFetch` of the Redocly config
   is wrapped the same way, as it is for redirects. Local files are not limited: they are read as
   they are on disk, with no decoding step that multiplies them.
   - 256 MiB per document: the largest document of the 1,820-entry compatibility corpus is
     Microsoft Graph beta, 71 MiB, so the limit is more than three times it. It is half of the
     longest string V8 holds (about 512 MiB): a body that passes can still become the text the
     parser needs; a larger one could not be parsed anyway.
   - 512 MiB per load: twice the document limit, so a split document may be twice the largest
     single one. It bounds what a crafted set of documents can make the process hold to that much
     text and its parsed form; the gzip proof now stops at about 590 MB of resident memory.
   - The two values join `RemoteDocumentLimits` (`DEFAULT_REMOTE_DOCUMENT_LIMITS`), which the
     composition roots inject, so tests use small ones. As in decision 5 there is no user option
     until a report shows a document that needs more.

| Option | Pros | Cons |
| --- | --- | --- |
| Stream and count decoded bytes, per document and per load (chosen) | Stops a zip bomb before the memory is taken; the total also stops many documents just under the document limit | Two more limits to document |
| Check `Content-Length` | No stream code | It is the compressed size, and a server may leave it out |
| Refuse `Content-Encoding` | Closes the decompression case | Real servers compress large documents; an uncompressed huge body is still unbounded |
| Only a per-document limit | One value | 10,000 documents of 256 MiB each are still allowed (decision 5) |
| A user option for the limits | A project with a larger document can raise them | No such document is known (YAGNI); one more flag in every composition root |

Review trigger: a report of a real document larger than 256 MiB, or of a run whose remote
documents together are larger than 512 MiB.

## Amendment (2026-11-09): limits bound the memory, not only the bytes

The round-2 hunt (S4) found that decision 6 bounded bytes, not memory. A remote body of 250 MiB
of `[{},{},…]`, under both byte limits and under a quarter of a megabyte as gzip, ended the
process with "JavaScript heap out of memory" at its 4 GB heap: parsing turns three bytes into an
object. The docs and threat model T2 claimed more than held. Measured on Node.js 26 and macOS
(peak resident memory of one `openapiTS()` call, one remote document behind a `$ref`):

| Remote body | Peak memory |
| --- | --- |
| Microsoft Graph beta (71 MiB, 2.65 million parsed nodes), gzip | 1,553 MB |
| `[{},…]`: 16 / 32 / 64 MiB (5.6 / 11 / 22 million objects) | 850 / 1,461 / 2,563 MB |
| `[0,…]`: 16 / 32 / 64 MiB (8 / 16 / 32 million numbers) | 686 / 1,327 / 1,954 MB |
| One string of 127 / 255 MiB; two of 255 MiB | 1,173 / 1,931 / 2,485 MB |

So text costs about 7 bytes of memory per byte (copies on the way from the stream to the parsed
string), and a parsed node about 110 bytes; the 1,820 corpus documents have at most 0.1 nodes
per byte, a crafted body 0.33 or more. Decision 6 now reads:

6. **Remote documents are bounded in bytes and in parsed nodes.** The body is read as a stream
   and its decoded bytes are counted as before, with lower limits: **128 MiB per document**
   (1.8 times Graph beta) and **256 MiB per load** (a split document may be twice the largest
   single one). The resolver parses every remote document itself, with Redocly's own
   `parseYaml` and its rule for which documents are parsed, and the parser reports every node
   it builds (keys included): past **8,000,000 nodes for all remote documents of one load**
   (three times Graph beta) the parse stops, before the rest is built, and the load fails with
   `SCHEMA_REF_FORBIDDEN`, reason `remote-documents-too-many-nodes` (`details.maxNodes`). The
   three values are in `DEFAULT_REMOTE_DOCUMENT_LIMITS`; tests inject small ones. Local files
   stay unlimited.

With these limits the crafted bodies above stop at 278 MB (250 MiB of `{},`, by bytes),
1,403 MB (127 MiB of `{},`, by nodes) and 1,491 MB (127 MiB of `0,`), and the largest ones that
pass peak at 1,560 MB (two strings of 127 MiB) and 1,687 MB (7.3 million objects): about what
Graph beta takes. The docs ("Limits") and T2 state these numbers and no more: the limits bound
the memory of remote documents near that of the largest real one; they do not make it small.

The node count also showed that counting the stored nodes of a parsed document (the YAML alias
check) spread an array of millions of children into one call, which overflowed the stack; it now
pushes them one by one.

| Option | Pros | Cons |
| --- | --- | --- |
| Lower byte limits only | One mechanism | A dense body costs 40 times its bytes: a limit low enough for it (about 40 MiB) refuses Graph beta |
| Count structure characters in the stream before parsing | Stops before parsing | YAML has no cheap exact count; an estimate counts commas and colons in descriptions and overstates real documents 2 to 4 times |
| A node limit per document as well as per load | Names the document | Every document is under the load limit too; one more value for no case |
| Count nodes while parsing, lower byte limits (chosen) | Exact for JSON and YAML; bounds both costs that were measured | The resolver parses remote documents itself, with Redocly's rule copied (ADR-005 pins Redocly 1.34) |

Review trigger: a real remote document larger than 128 MiB or with more than 8 million nodes, a
Redocly upgrade (the parse rule is copied), or a measured peak above 2 GB within the limits.

## Amendment (2026-11-09): the review at the 2 GB trigger

The recheck of the round-2 hunt hit the trigger above. A remote schema of 7.8 million nodes that
the output uses (39 objects of 100,000 properties each, 54 MiB of JSON) peaked at 2,121 MB through
the Node API and 2,320 MB through the CLI. It also showed that the limits counted per load while
the docs and T2 said "per run": the CLI generated the APIs of a `redocly.yaml` all at once, as
openapi-typescript does, so two such APIs passed 10 million remote nodes in one run (2.4 GB), and
the CPU work of a large API delayed the fetch of a small one until its 60-second limit ended it.

Our own measurements of the same schema, on Node.js 26 and macOS, varied from 1,657 to 2,283 MB
between runs with the default heap of 4 GB. With `--max-old-space-size=2048` (about the default
heap on a machine with 8 GB of memory) the CLI generated two of these APIs and peaked at
1,975 MB. So a peak above 2 GB is the garbage collector using the room it has, not memory the
schema needs: the limits still end a remote document that would crash the process. Decisions:

7. **The limits count per schema, and a run generates one schema at a time.** The CLI generates
   the APIs of a config one after another, in the order of the config, and writes them at the
   end as before (ADR-043). A run takes the memory of its largest API, plus the text of the
   others until they are written, and no API holds up the fetches of another. The docs and T2
   say "per schema".
8. **The printed text is one flat string.** The text writer joined its parts with `+=`, and V8
   keeps such a string as a tree of its parts until it is flattened: about six times the size of
   the text. The CLI keeps each API's text until every API is generated, so the first of two
   large APIs kept about 760 MB (six times its 127 million characters). The writer now collects
   the parts and joins them once; with the two APIs above the run peaked at 2,172 MB, against
   2,048 to 2,192 MB for one of them alone.
9. **A request whose connection closed before any response is sent once more.** Generating one
   API after another showed the next cost of CPU work: the server closed a kept-alive connection
   while the process was busy, and the next request on it failed with `EPIPE`. RFC 9112 §9.3.1
   allows a client to send an idempotent request again in that case, and browsers do. The
   loader's own fetch sends a `GET` or `HEAD` once more, within the same 60-second signal, when
   fetch fails with `ECONNRESET`, `EPIPE` or `UND_ERR_SOCKET` before a response; a second failure
   is thrown. A `customFetch` of the Redocly config is not retried: it owns its connections.

The byte and node limits stay: lowering them would buy back memory that a 2 GB heap does not
need, and refuse documents three times smaller than now.

| Option | Pros | Cons |
| --- | --- | --- |
| One budget of remote bytes and nodes for all APIs of a run | The docs' "per run" becomes true | A config with several real APIs, each well under the limits, fails because of the others |
| Generate the APIs one after another (chosen) | Memory of the largest API; no timeouts from another API's work | A config of many remote APIs takes the sum of their times, not the longest |
| Lower the node limit to 6 million | Peaks under 1.8 GB | Refuses a document 2.3 times Graph beta for memory a 2 GB heap has |
| Keep each API's text as UTF-8 bytes until written | Smallest possible held text | Decodes again to write and to check; fixes only the CLI, not `astToString` |
| Retry every failed fetch with backoff | Covers more network errors | A refused connection or a DNS failure is an answer; retrying it only waits |

Review trigger: a remote document within the limits that fails with "heap out of memory" in a
heap of 2 GB, or a report of a config of many remote APIs that became too slow.

## Amendment (2026-11-09): messages hide the query of a URL

Messages hid the user info of a URL (`https://***@host/…`) and showed the rest. A schema URL
often carries its secret in the query instead: an API key (`?api_key=…`) or the signature of a
pre-signed URL (`?X-Amz-Signature=…`). Every failure to load such a URL printed it, in CI job logs
too.

Decision: messages, the URLs in `details`, and the terminal logger hide the whole query of every
URL as `?***`; the path and the fragment stay, so a message still names the document and the
place in it. `src/domain/url-secrets.ts` finds a URL by its `://` and takes it whole, up to a space,
quote or angle bracket, which a serialized URL percent-encodes; the scan stays linear. Hiding only
parameters with secret-looking names was rejected: no list of names covers every API.

## Amendment (2026-11-09): the cause chain, unparsable URLs and the case of a scheme

The recheck of the amendment above found three ways a URL secret still left the generator.

1. **The `cause` of a typed error kept the original error.** `console.error(error)`,
   `util.inspect` and error trackers print the whole chain, and a lower-level error quotes the URL
   (fetch refuses `https://user:token@host/…` and names it). `OpenAPITypesafeError` now keeps a
   copy of its cause, of the same class and with the same fields, whose text has the secrets
   hidden; an error with nothing to hide stays the same object, so `error.cause.code` works as
   before. Dropping the cause was rejected: the CLI and users read the network reason from it.
2. **A location that does not parse as a URL crashed the CLI** (`Unexpected error: TypeError:
   Invalid URL`, exit code 70), and the Node API threw the parser's `TypeError`. The CLI now fails
   with `CLI_LOCATION_INVALID` (exit code 2) and the Node API with `SCHEMA_SOURCE_INVALID` (reason
   `url`). Their messages hide everything from the `://` to the last `@` before the query: without
   a parse there is no telling where the authority ends (`http://user:a/b@host/x`).
3. **A `$ref` with an uppercase scheme** (`HTTP://host/x.yaml`) was read as a file path, because
   Redocly takes only `http://` and `https://` as URLs; the path no longer looked like a URL, so its
   "not found" message showed the user info and the query. A scheme is the same in any case (RFC
   3986, section 3.1), so the resolver writes it in lowercase and the `$ref` loads as the URL it
   is, within the same limits. The Node API reads a source string with such a scheme as a URL too.

A URL in a message now also ends before punctuation that the message puts after it (`…?***: 404`,
`(…?***)`), which the hidden query took with it.
