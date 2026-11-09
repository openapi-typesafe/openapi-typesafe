---
title: Threat model
description: How openapi-typesafe treats untrusted OpenAPI documents, what it defends against, and the open risks
---

# Threat model

Reviewed on 2026-11-02 against the code at the commit that adds this file,
and again on 2026-11-06 after the security audit before 1.0.0 (ADR-033; ADR-030, amendment).
Review it again when a new input, option or output is added, and before each major release.

## What we protect

| Asset | Why it matters |
| :-- | :-- |
| The developer's machine and CI runner | The generator runs there with the user's rights, often on documents from other people |
| The generated `.ts` file | It is committed and compiled into applications; code in it runs everywhere they run |
| Requests made by the fetch client | They carry credentials and user data to the API |
| The published npm packages | Every user installs them; a compromised release reaches all of them |

## Trust boundaries

| Input | Trusted? | Notes |
| :-- | :-- | :-- |
| The OpenAPI document and every document it references | **No** | Often downloaded from a vendor or a URL; treat it like data from the network |
| CLI flags, `redocly.yaml`, Node API options | Yes | Chosen by the developer |
| `transform`, `postTransform` and other callbacks, `inject` text | Yes | The developer's own code; it may write any TypeScript on purpose |
| Values passed to the fetch client at run time (path, query, body, headers) | **No** | Often come from end users |
| Dependencies and the release pipeline | Verified | Lockfile, pinned actions, provenance |

## Threats and controls

Status: **Controlled** (a control and a test exist), **Accepted** (documented, no change), or
**Open** (a follow-up is needed; listed at the end).

### T1. Code injection into the generated file — Controlled

A name, description, enum value, path or other text from the document ends the comment, string,
template literal or key it is written into, and the rest becomes code in the generated file.

- Controls: descriptions and other comment text escape `*/`; string literals and quoted keys use
  full escaping (`application/print/literal-text.ts`); line comments of `--enum` turn line breaks
  into spaces; raw type text built from document text is escaped
  (`domain/ir/raw-text-escapes.ts`); identifiers are built from a safe character set and an
  empty result fails with `ENUM_NAME_EMPTY`.
- Two inherited injections were found and fixed in this review (research/legacy-bugs.md #12 and
  #13): `--root-types` with a quote in a component name, and `--path-params-as-types` with a
  backslash or `${` in a URL.
- Tests: `test/security/injection.test.ts` puts generated attack payloads into every text field
  under every option that changes how text is written, and checks that the output parses and that
  the payload never becomes an identifier. `test/domain/ir/raw-text-escapes.test.ts` checks that
  escaped text reads back unchanged.

### T2. Denial of service by a crafted document — Controlled

Deep nesting, long `$ref` chains, cycles, unsupported keys, YAML aliases that expand a file a
billion times, or a server that never answers (or sends its body one byte at a time) crash or hang
the generator.

- Controls: typed errors `SCHEMA_TOO_DEEP`, `SCHEMA_REF_INVALID`, `SCHEMA_KEY_UNSUPPORTED`; a
  60-second limit on every remote fetch, body included; the YAML parser stops at 100 levels; a
  YAML file whose aliases expand it more than 100 times past 1,000,000 nodes fails with
  `SCHEMA_PARSE_FAILED`; at most 10,000 remote documents per schema (one API of a `redocly.yaml`, whose APIs are
  generated one after another), fetched at most 16 at a time,
  so a document that keeps referring to new URLs ends with `SCHEMA_REF_FORBIDDEN` instead of
  sending requests until the local ports run out (ADR-033); remote bodies are read as a stream
  and counted after `gzip`, `deflate` or `br` is decoded, so a body larger than 128 MiB, or remote
  documents larger than 256 MiB together for one schema, end with `SCHEMA_REF_FORBIDDEN` (reasons
  `remote-document-too-large`, `remote-documents-too-large`) before a compressed "zip bomb" fills
  the memory, also through a `customFetch` of the Redocly config; the parser counts the nodes it
  builds, and remote documents of one schema that parse into more than 8,000,000 nodes together stop
  with `SCHEMA_REF_FORBIDDEN` (reason `remote-documents-too-many-nodes`), since a dense body takes
  far more memory than its bytes; path keys are scanned in linear time.
- Residual risk: the limits bound the memory of remote documents, they do not make it small.
  Documents just under them peak at about 1.2 to 2.3 GB of resident memory with the default heap
  of 4 GB, and finish within a heap of 2 GB (measured; the largest real document, Microsoft Graph
  beta, takes about 1.6 GB). Run untrusted documents in a process whose memory limit you choose.
  Local files have no size limit.
- Tests: `test/defensive/`. Limits are listed in docs/advanced.md, "Limits".

### T3. Local file read through `$ref` — Controlled by an option (R1)

A local document can refer to any file the process can read (`$ref: ../../home/me/.kube/config`).
A YAML or JSON file is parsed, and its content can land in the generated file, for example as an
`example` in a comment. A document loaded from a URL could do this too until 1.0: Redocly resolves
its `$ref`s with `new URL()`, so `C:/Users/me/x.json` (a drive letter, an absolute path on
Windows) and `file:///…` became local paths that were read from disk.

- Control, always on: a `$ref` in a remote document that does not resolve to an `http(s)` URL is
  refused with `SCHEMA_REF_FORBIDDEN` (reason `local-ref-from-remote`, ADR-033).
- Control: `--local-ref-root <dir>` (`localRefRoot`) refuses a local `$ref` outside the directory,
  after links are resolved, with `SCHEMA_REF_FORBIDDEN` (ADR-017). It is off by default, because
  the behavior is inherited and documents rely on references outside their directory.
- Tests: `test/security/ref-access.test.ts`.

### T4. Requests to internal hosts (SSRF) through remote `$ref` — Controlled by an option (R2)

Any document can make the generator fetch any `http(s)` URL it can reach, including
`localhost`, private networks and cloud metadata addresses, and put the response into the output.
This matters in CI and on servers that generate types from user-supplied documents.

- Control: `--remote-ref-hosts <hosts>` (`remoteRefHosts`) refuses a remote `$ref`, and each
  redirect, to a host that is not listed, with `SCHEMA_REF_FORBIDDEN`; `[]` refuses all
  (ADR-017). It is off by default, as in openapi-typescript. A listed name is trusted: its address
  is not checked after DNS resolution.
- Tests: `test/security/ref-access.test.ts`, `test/adapters/redocly-loader/ref-access.test.ts`.

### T4a. Configured credentials sent to another host — Controlled

`resolve.http.headers` in `redocly.yaml` often carries an API key. A document, or a server it
names, tries to get it sent somewhere else: through a redirect to another origin (fetch keeps every
header but `Authorization`, `Cookie` and `Proxy-Authorization`), through a URL whose query makes a
`*` pattern match (`https://evil.example?.trusted.example/x.yaml`), or over plain HTTP.

- Controls: the loader chooses the headers itself for every request and every redirect hop, from
  the protocol, host and path of the parsed URL; a header goes over HTTPS or to a loopback host,
  and over plain HTTP to another host only when its pattern starts with `http://`; redirects are always followed by hand (ADR-033).
- Tests: `test/security/configured-headers.test.ts`,
  `test/adapters/redocly-loader/ref-access.test.ts`.

### T4b. Credentials in messages and logs — Controlled

A URL with user info (`https://user:token@host/spec.yaml`) as the input, in a `$ref` or in a
redirect fails, because fetch refuses such URLs, and the message named the whole URL. In CI the
token ended up in the job log.

- Controls: every typed error message, the URLs in `details` and every line the terminal logger
  writes show such a URL as `https://***@host/…`. Header values from `redocly.yaml` are never
  printed.
- Tests: `test/domain/url-credentials.test.ts`, `test/defensive/remote-refs.test.ts`,
  `test/adapters/terminal-logger/terminal-logger.test.ts`.

### T5. Unsafe requests from the fetch client — Controlled

User-supplied path parameters move the request to another path (`..`) or, with an empty first
value and a relative `baseUrl`, to another host (`//evil.example`), query and header values
break the request, or keys of an object parameter (data from `additionalProperties`) add a
parameter, a path segment or an object member.

- Controls: path values are always percent-encoded, and query values unless the parameter sets
  `allowReserved`; a path value that would form a `.` or `..` segment makes the call throw
  (`Dot path segment in …`, ADR-013), because percent-encoding keeps dots; a path that starts with
  `//` once the values are in (an empty first value) throws too, because a browser reads it as
  another host (ADR-030, amendment); values go into the template as text, never as replacement
  patterns; query parameter names are percent-encoded too, except `[ ] $ : @ ,`, and object keys
  without exceptions (ADR-013, decision 9 and its amendment); a server that decodes a query before
  it splits it (`qs`) can still read `,` `[` `]` in a key as structure, inside that one parameter,
  so the docs say to validate keys from end users; headers go through the platform `Headers` class,
  which rejects line breaks.
- Tests: the fetch client's serializer tests, `test/common/path-dot-segments.test.ts` and
  `test/common/param-name-encoding.test.ts`.
- Known, by the Fetch standard: on a redirect to another origin, `fetch` drops only
  `Authorization`, `Cookie` and `Proxy-Authorization`. A credential in a custom header
  (`X-API-Key`, an `apiKey` security scheme) is sent to the new origin, by this client as by
  openapi-fetch and any `fetch` caller. The client keeps the platform's default
  (`redirect: "follow"`), because changing it would break APIs that redirect within their own
  host. The docs give the controls: send credentials in `Authorization`, set `redirect: "error"`,
  or add the key in a middleware for the API origin only, with `redirect: "manual"`
  ([Redirects and custom auth headers](/fetch/middleware-auth#redirects-and-custom-auth-headers)).

### T6. Supply chain — Controlled

A compromised dependency, GitHub Action or npm token publishes a malicious version.

- Controls: lockfile with exact versions; GitHub Actions pinned by commit SHA; few runtime
  dependencies (ADR-005 for the schema loader); `attw` and packed-tarball checks; trusted
  publishing with provenance and no npm tokens; SBOM; dependency review and update bots;
  Scorecard; branch rulesets.
- Known: `@redocly/openapi-core` 1.x pulls in dependencies with published advisories
  (research/backlog.md, item 2); ADR-005 keeps 1.x for 1.0, and its review trigger covers this.
  The latest review (GHSA-g3hv-75wg-m249, minimatch) is in ADR-005, "Reviews".
- Known, development only: the docs site's `vitepress` 1.6.4 (latest stable) pins `vite` 5, which
  has GHSA-587h-7wmj-h5pm (the dev server's open-in-editor check, Windows only). It does not reach
  any published package; it is fixed when vitepress 2 is stable.

### Prototype keys — Tested

`__proto__`, `constructor` and `prototype` as schema, property, path, parameter, operation and enum
names are kept and generate valid TypeScript, and the fetch client serializes them as names without
writing to `Object.prototype` (`test/security/prototype-keys.test.ts`,
`packages/openapi-typesafe-fetch/test/common/prototype-keys.test.ts`). The schema loader
(Redocly 1.x) cannot read a few of them where it reads keys (`valueOf` and the like, or a
`constructor` entry whose value has a string `name`, such as a security scheme); those fail with
the typed error `SCHEMA_KEY_UNSUPPORTED`, which names each key (docs/advanced.md, "Limits"). A document passed to the Node
API as a JavaScript object literal loses a `__proto__: …` key before the generator sees it, because
the literal sets the prototype; use a computed key (`["__proto__"]: …`) or pass JSON or YAML text.

### T7. Trusted inputs used as an attack path — Accepted

`redocly.yaml` plugins, callbacks and `inject` run or emit any code by design. A project that lets
others change them has a code-review problem, not a generator problem.

## Advice for users

- Treat an OpenAPI document from someone else like code: review changes to it, and review the
  diff of the generated file before you commit it.
- When the document is not yours, set `--local-ref-root` and `--remote-ref-hosts` (see
  [Untrusted documents](/advanced#untrusted-documents)), and generate in a sandbox or CI job with
  no secrets and no access to internal networks (T3, T4).

## Open risks

None. R1 and R2 are controlled by opt-in options (ADR-017). Whether they become the default is
decided in the 2.0 planning, as ADR-017 (decision 5) records.
