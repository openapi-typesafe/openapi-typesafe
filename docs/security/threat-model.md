---
title: Threat model
description: How openapi-typesafe treats untrusted OpenAPI documents, what it defends against, and the open risks
---

# Threat model

ENGINEERING_PLAN 9.1. Reviewed on 2026-11-02 against the code at the commit that adds this file.
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
| Dependencies and the release pipeline | Verified | Lockfile, pinned actions, provenance (Phase 9) |

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
  `SCHEMA_PARSE_FAILED`.
- Tests: `test/defensive/`. Limits are listed in docs/advanced.md, "Limits".

### T3. Local file read through `$ref` — Controlled by an option (R1)

A local document can refer to any file the process can read (`$ref: ../../home/me/.kube/config`).
A YAML or JSON file is parsed, and its content can land in the generated file, for example as an
`example` in a comment. A document loaded from a URL cannot do this: its relative and `file:`
references resolve against the URL, and only `http(s)` URLs are fetched.

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

### T5. Unsafe requests from the fetch client — Controlled

User-supplied path parameters move the request to another path (`..`), or query and header
values break the request.

- Controls: path values are always percent-encoded, and query values unless the parameter sets
  `allowReserved`; a path value that would form a `.` or `..` segment makes the call throw
  (`Dot path segment in …`, ADR-013), because percent-encoding keeps dots; headers go through the
  platform `Headers` class, which rejects line breaks.
- Tests: the fetch client's serializer tests.

### T6. Supply chain — Controlled from Phase 9

A compromised dependency, GitHub Action or npm token publishes a malicious version.

- Controls: lockfile with exact versions; GitHub Actions pinned by commit SHA; few runtime
  dependencies (ADR-005 for the schema loader); `attw` and packed-tarball checks; trusted
  publishing with provenance and no npm tokens (9.3); SBOM (9.5); dependency review and update
  bots (9.7); Scorecard (9.6); branch rulesets at publication (9.8).
- Known: `@redocly/openapi-core` 1.x pulls in dependencies with published advisories
  (research/backlog.md, item 2); ADR-005 keeps 1.x for 1.0, and its review trigger covers this.

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
decided for 2.0; that decision is tracked as an issue when the repository goes public (task 11.2).
