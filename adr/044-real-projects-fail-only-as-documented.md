# ADR-044: Real projects fail only as documented

- Status: Accepted
- Date: 2026-11-09

## Context

The full compatibility run checks 22 open-source projects that use openapi-typescript or
openapi-fetch (ENGINEERING_PLAN 8.4). Each runs as it is, then switched to openapi-typesafe by
package name only, and every step that passed before must pass after the switch. The first
nightly run after the rc.3 fixes had four regressions:

- unsplash-js and coderabbit-bitbucket hit two bugs of the client's declarations (ADR-034,
  amendment of 2026-11-09). They are fixed and pass again.
- openapi-axios pins TypeScript 5.3. The `typescript` peer of the generator needs 5.4 or newer
  (ADR-006), so npm stops the install with `ERESOLVE`.
- swr-openapi's tests mock `client.GET` with `{ data: undefined, error: undefined }` and an
  `Error` as error. openapi-fetch typed the method's return type `any` for the generated
  `interface paths` (upstream #2267); the client types the call, so the mocks do not compile.

The last two are breaking changes made on purpose and listed in the Major changes and the
migration guide. As regressions they kept the nightly run red, which hides the next real one.

## Decision

1. A project of `corpus/dependents.json` may name an `expectedFailure`: the step that fails after
   the switch (a project step or a harness step such as `install`) and the breaking change, in
   the words of the migration guide. Only a breaking change that the Major list and the migration
   guide name can be an expected failure.
2. The check gives such a project the status `expected-failure` when its first failing step is
   that step, and accepts it. A failure at another step is `regressed`. A switched run that no
   longer fails is `stale-expectation`, and the check fails, as for a baseline failure: the entry
   no longer says what happens.
3. The report counts both statuses and lists the reason of each expected failure under the table,
   and the compatibility page names them.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Expected failure at one step, with the reason (chosen) | The run is green only when every failure is documented; a new failure, or a fixed one, is reported | Two more statuses in the harness |
| Apply the migration step in the switched run (upgrade TypeScript, rewrite the mocks) | The rest of the project keeps being checked | The switch is no longer by package name only; the harness edits project code |
| Drop the two projects | No harness change | Loses the checks of their other steps and of later changes |
| Keep them as regressions | No change | The nightly run stays red, and a real regression goes unseen |

## Consequences

- openapi-axios is checked up to its install only, and swr-openapi up to its type check. A change
  that breaks them in another way still shows as a regression only once the expected step passes.
- An expected failure must be removed when the change that causes it goes, or the check fails.

## Amendment (2026-11-09): a third expected failure

permit-cli imports `openapi-typescript-helpers` without listing it, and the client no longer
installs the helpers (ADR-034, amendment "nothing installs the helpers for code that does not list
them"), so its type check fails after the switch. This is the review trigger "a third project
needs an expected failure", and a failure at its only step: the expected failure hides all of its
check.

The decision stays. Adding the dependency in the switched run would be the rejected option "apply
the migration step": the run checks a switch by package name only, and the migration guide covers
the step. The loss is bounded: the run passed with the dependency added by hand, and the generator
output of permit-cli's committed schemas is not part of its check (it keeps its files). The entry
names the step and the reason, and the compatibility page lists all three.

## Review trigger

A fourth project needs an expected failure, an expected failure would be in a step after the
install that hides most of the project's checks, or the harness learns to apply migration steps.
