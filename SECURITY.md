# Security Policy

## Supported versions

Only the latest released minor version of each package receives security fixes. Before 1.0 there are no released
versions; the policy applies from the first published release.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting).

Please include:

- the affected package and version;
- a description of the problem and its impact;
- a minimal OpenAPI document or code that reproduces it.

## What to expect

| Step | Target |
|---|---|
| Acknowledgement of the report | within 3 business days |
| Initial assessment (valid or not, severity) | within 7 days |
| Fix released for a confirmed High or Critical issue | within 30 days |

We credit reporters in the advisory unless they ask us not to.

## Scope

In scope:

- code injection into generated output through crafted schema content (names, descriptions, enum values, examples);
- crashes or unbounded resource use triggered by a crafted schema (for example cyclic or remote `$ref`);
- a crafted schema that reads local files from a remote document, or that gets credentials sent to
  another host (headers from `redocly.yaml`, credentials in URLs printed to logs);
- vulnerabilities in the fetch client and React Query bindings, such as a parameter value that sends a
  request to another path or host;
- the migration tool (`openapi-typesafe-migrate`) running code, reading or writing outside the
  folder it migrates, or copying credentials into its output, when the folder holds crafted files
  (it treats the project tree as untrusted input);
- compromise of the release process or published packages.

Out of scope: vulnerabilities in the APIs you generate types for, issues in unsupported versions, and
platform behavior the client inherits from `fetch` (for example custom headers kept on a redirect, see
[Middleware & Auth](docs/fetch/middleware-auth.md#redirects-and-custom-auth-headers)).

The [threat model](docs/security/threat-model.md) lists what the generator and the client defend
against and how.

## Release integrity

Packages are published from GitHub Actions with npm trusted publishing (OIDC) and provenance. Verify a package with
`npm audit signatures`. A release without provenance is not an official release.
