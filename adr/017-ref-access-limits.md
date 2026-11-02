# ADR-017: Opt-in limits for local and remote `$ref`

- Status: Accepted
- Date: 2026-11-02

## Context

The threat model (docs/security/threat-model.md) left two risks open before the repository goes
public:

- **R1 (T3).** A local document can refer to any file the process can read
  (`$ref: ../../home/me/.kube/config`), and its content can land in the generated file.
- **R2 (T4).** Any document can make the generator fetch any `http(s)` URL, including
  `localhost`, private networks and cloud metadata addresses (SSRF).

openapi-typescript 7.13 has no limit for either. Real documents rely on both: shared schemas in a
parent directory of a monorepo, and remote `$ref`s to a vendor's or a local dev server. Redocly 1.34
(ADR-005) has no option for either; its `BaseResolver` is exported and is the resolver that lint and
bundle take, and `resolve.http.customFetch` replaces its fetch.

## Decision

1. Two options, off by default, so 1.x stays a drop-in successor:
   - `localRefRoot` / `--local-ref-root <dir>`: a local `$ref` file must be in this directory or
     below it, after links are resolved (`realpath`).
   - `remoteRefHosts` / `--remote-ref-hosts <a,b>`: a remote `$ref` must come from a listed host
     (`name` matches any port, `name:port` one port); `[]` allows none. Redirects are followed by
     hand (at most 5), each target is checked, and configured headers are dropped on another
     origin, as fetch does for `Authorization`.
2. The root document (the CLI input or the Node API source) is never limited; only what it refers
   to is.
3. The check runs in `RefAccessResolver`, a subclass of Redocly's `BaseResolver`, before a document
   is read or fetched. A refusal fails with the typed error `SCHEMA_REF_FORBIDDEN` (ADR-011, exit
   code 3), with `details.ref` and `details.reason`, even when the Redocly config turns off
   `no-unresolved-refs`.
4. A listed host name is trusted; its address is not checked after DNS resolution.
5. For 2.0 we decide whether the limits become the default (local root = the root document's
   directory, no remote `$ref`); that is a breaking change and needs the beta and 1.x feedback.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Opt-in options in 1.x (chosen) | No change for existing projects; untrusted documents can be handled now | Users must know to turn them on; the docs and the threat model say when |
| Limits on by default | Safe without configuration | Breaks monorepo and dev-server documents that work with openapi-typescript; against the drop-in goal |
| Refuse private and link-local addresses by DNS lookup | Catches a listed name that resolves to an internal address | Needs a custom dispatcher (undici) and its own DNS handling; listed hosts are chosen by the developer, and DNS rebinding needs control of a listed name |
| Only document a `customFetch` (the earlier state) | No code | Does not cover local files at all; every user writes the same filter |
| Check after bundling | No Redocly subclass | Too late: the file was read and the request was sent |

## Consequences

- `RefAccessResolver` overrides `resolveDocument` and `loadExternalRef` of Redocly 1.34. A Redocly
  update must keep these public methods; the tests in `test/security/ref-access.test.ts` catch a
  change.
- The loader fetches with `redirect: "manual"` when hosts are limited; a `customFetch` from the
  Redocly config is wrapped, not replaced.
- The threat model marks R1 and R2 as controlled by opt-in options.

## Review trigger

The schema loader changes (ADR-005, Redocly 2.x); a report that a listed host was used to reach an
internal address; or the 2.0 planning, which decides the defaults.
