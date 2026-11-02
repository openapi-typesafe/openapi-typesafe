import * as z from "zod";
import { type EvalTask, TASK_CATEGORIES, type TaskCategory } from "../domain/eval-task.ts";

/** The contents of `tasks/<id>/task.json`; the id is the directory name. */
const TaskFileSchema = z
  .object({
    title: z.string().min(1),
    category: z.enum(TASK_CATEGORIES as [TaskCategory, ...TaskCategory[]]),
    prompt: z.string().min(1),
  })
  .strict();

/** Task ids are directory names: a two-digit number and a kebab-case slug. */
const TASK_ID_PATTERN = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse a task file. Throws with the id and every problem when the file is invalid. */
export function parseTask(id: string, fileText: string): EvalTask {
  if (!TASK_ID_PATTERN.test(id)) {
    throw new Error(`Task ${id}: the directory name must look like "07-delete-pet"`);
  }
  let json: unknown;
  try {
    json = JSON.parse(fileText);
  } catch (error) {
    throw new Error(`Task ${id}: task.json is not JSON (${String(error)})`);
  }
  const parsed = TaskFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Task ${id}: invalid task.json: ${z.prettifyError(parsed.error)}`);
  }
  return { id, ...parsed.data };
}
