# Skill evals

Measures whether the agent skill in [`skills/openapi-typesafe`](../../skills/openapi-typesafe/SKILL.md) makes a
coding agent write correct code with the openapi-typesafe packages (ENGINEERING_PLAN 10.4). A task passes when
`tsc --noEmit` and the hidden tests pass after the agent has finished; the skill passes at a 90% pass rate.

## How a task runs

1. A fresh copy of [`template/`](template) goes to a temporary directory outside the repository: a small web
   client of the Pet Clinic API (`openapi.yaml`, its generated `src/api/schema.d.ts`, a strict `tsconfig.json`).
   `node_modules` is a link to this package's `node_modules`, so no install is needed. The task's `start/` files,
   if any, are copied over it (for example a project that still uses openapi-fetch).
2. The skill is copied to where the agent looks for project skills (`.claude/skills/openapi-typesafe` for Claude
   Code), unless the run is a baseline (`--without-skill`).
3. The agent gets the prompt on standard input: a short project brief and the task. It runs with only the
   project's settings and no MCP servers, so the user's own instructions, memory and tools do not change the
   result.
4. Then the hidden check `tasks/<id>/check.ts` and the test kit [`kit/fake-api.ts`](kit/fake-api.ts) are added
   under `eval/`, and `tsc --noEmit` and `vitest run` run in the workspace. The checks build real clients on a
   fake `fetch`, so they test behavior, not how the code is written.

## Tasks

34 tasks in `tasks/<id>/`: `task.json` (title, category, prompt), `check.ts`, `solution/` (the reference
solution) and an optional `start/`.

| Category    | Tasks | What they exercise                                                                            |
| ----------- | ----- | --------------------------------------------------------------------------------------------- |
| setup       | 2     | Typed client factory; generate and `--check` scripts                                          |
| typed-calls | 9     | Path, query and header parameters, JSON, text and binary bodies, 204, cursor pagination       |
| errors      | 5     | `response.ok` vs. empty error bodies, typed error bodies, network errors, a bug fix           |
| middleware  | 6     | Auth tokens, public endpoints, `schemaPath`, `onError` fallback, `eject`                      |
| types       | 2     | Model types from `components`, generic helpers from `openapi-typesafe-helpers`                |
| react-query | 4     | `queryOptions`, query keys and invalidation, `fetchQuery` errors, a component with `useQuery` |
| migration   | 3     | openapi-fetch / openapi-react-query projects, a `ts.factory` transform to IR callbacks        |
| generator   | 2     | Node API with options, typed error codes                                                      |
| testing     | 1     | Tests with a fake `fetch`, checked against a broken implementation                            |

## Usage

Build the packages first (`pnpm build` at the root), then run from this directory with Node 22.18 or newer:

```sh
pnpm validate                         # check the tasks themselves; no agent
pnpm eval                             # Claude Code with the skill (default model: sonnet)
pnpm eval --without-skill             # the same agent without the skill, as a baseline
pnpm eval --task 07-delete-pet        # one task (repeatable)
pnpm eval --model opus --concurrency 3 --keep-workspaces
```

`validate` runs every task twice without a coding agent: with the reference solution, which must pass, and on
the untouched project, which must fail. A task that fails either way cannot measure the skill. CI runs it.

`eval` needs the `claude` command and a signed-in Claude Code (or `ANTHROPIC_API_KEY`). It exits with 0 when
the pass rate is at least 90%, 1 when it is lower, and 2 for invalid arguments.

Each run writes a JSON Lines log to `.logs/skill-evals/` at the repository root (every step, with the tool
output of failed ones) and, for `eval`, a directory of the same name with the full agent transcript per task.
