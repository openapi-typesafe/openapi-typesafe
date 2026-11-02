# Agent skill evals (task 10.4)

Measured on 2026-11-02 with `tools/skill-evals` (see its README for how a task runs) and the skill in
`skills/openapi-typesafe` at the commit that adds this note.

## Setup

- 34 tasks in 9 categories, each checked by `tsc --noEmit` and hidden Vitest checks that build real clients on a
  fake `fetch`. `pnpm validate` confirmed first that every reference solution passes and every untouched project
  fails, so no check passes by accident.
- Agent: Claude Code 2.1.316 in print mode, model `claude-sonnet-5-5` (`--model sonnet`), with only project
  settings and no MCP servers, 3 tasks at a time.
- The packages are the workspace builds; the projects get them through a linked `node_modules`, so the agent can
  read their `.d.ts` files as it would in a real project.

## Results

| Run | Passed | Pass rate | Mean turns | Median time | Cost |
| --- | --- | --- | --- | --- | --- |
| With the skill | 34 / 34 | 100% | 5.9 | 14 s | $2.27 |
| Without the skill (baseline) | 33 / 34 | 97.1% | 5.7 | 17 s | $2.18 |

The skill meets the 90% target of task 10.4. The agent loaded it in all 34 tasks (the `Skill` tool call is the
first or second step of every transcript).

The one baseline failure (`31-migrate-react-query`) was a gap in the task, not in the agent: the prompt named
openapi-fetch and openapi-react-query but not openapi-typescript, which the check also requires to be gone.
After the prompt named all three packages, the task passed both with and without the skill (rerun of that task
only). Both runs found and used `openapi-typesafe-migrate` in the three migration tasks.

So on this task set the skill does not change the pass rate: the model reads the packages' `.d.ts` files and
the prompts name the files and signatures, which is enough for these tasks. What the skill changes is how the
agent gets there: without it, the agent read files under `node_modules/openapi-typesafe*` in 31 of 34 tasks;
with it, in 9. The median task took 14 s instead of 17 s, the slowest 35 s instead of 51 s; the cost was about
the same, because the skill itself is read into the context. A task set that separates the two runs needs
vaguer prompts and traps that the types do not reveal (an empty `500`, a JSON-encoded text body); that is
follow-up work, not a condition of task 10.4.

## Limits

- One agent and one model. The harness takes other agents as presets (`src/cli/agents.ts`); a second agent would
  show whether the skill helps beyond Claude Code.
- The prompts name the files and the signatures, because the hidden checks import them. Real requests are
  vaguer, so the pass rate here is an upper bound for the API knowledge, not for understanding a request.
- Each task ran once. Agents are not deterministic; repeat runs before comparing small differences.

## Logs

`.logs/skill-evals/<time>-eval.jsonl` has every step of a run; the directory of the same name holds the full
agent transcript (stream JSON) of each task. Both are local and not committed.
