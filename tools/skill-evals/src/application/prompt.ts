import type { EvalTask } from "../domain/eval-task.ts";

/**
 * What every task prompt starts with: the project, and the rules that make a run comparable.
 * Installing or fetching would make results depend on the network, so both are ruled out.
 */
const PROJECT_BRIEF = [
  "You work in the TypeScript project in the current directory: the web client of the Pet",
  "Clinic API. The OpenAPI document is `openapi.yaml`; `src/api/schema.d.ts` holds the types",
  "generated from it. Dependencies are installed in `node_modules`: do not install packages and",
  "do not use the network. Work only inside this directory. When you finish, `npx tsc --noEmit`",
  "must pass, and so must `npx vitest run` if the project has tests.",
].join(" ");

export function buildPrompt(task: EvalTask): string {
  return `${PROJECT_BRIEF}\n\nTask: ${task.prompt}\n`;
}
