import { ERROR_CODES, OpenAPITypesafeError } from "../domain/errors.js";

/**
 * Deeply nested schemas (ENGINEERING_PLAN 8.5). Loading, bundling, transforming and printing walk
 * schemas recursively, and Redocly follows each `$ref` inside the walk. On the default Node.js
 * stack, about 550 levels of inline schemas or a chain of about 900 `$ref`s (each schema refers to
 * the next) run out of call stack. Real documents stay far below: every YAML or JSON file goes
 * through the YAML parser, which stops at 100 levels, and the whole corpus passes. The overflow is
 * reported as a typed error instead of a `RangeError` with a stack trace.
 */

/** The step that ran out of call stack; named in the message and the details. */
export type DeepSchemaStep = "load" | "transform" | "print";

/** V8 and JavaScriptCore (Node.js, Deno, Bun) throw a `RangeError` with this message. */
const STACK_OVERFLOW_MESSAGE = /maximum call stack size exceeded/i;

/** Whether a thrown value is a call stack overflow. */
export function isStackOverflowError(error: unknown): boolean {
  return error instanceof RangeError && STACK_OVERFLOW_MESSAGE.test(error.message);
}

/** The typed error for a document nested too deeply for the call stack. */
export function schemaTooDeepError(step: DeepSchemaStep, cause: unknown): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_TOO_DEEP,
    message:
      `The schema is nested too deeply to ${step}: the call stack ran out. Both inline ` +
      "schemas and chains of $ref (each schema referring to the next) count; shorten the deepest.",
    details: { step },
    cause,
  });
}

/** Run a step and report a stack overflow in it as SCHEMA_TOO_DEEP; other errors pass through. */
export function withStackOverflowReported<T>(step: DeepSchemaStep, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw isStackOverflowError(error) ? schemaTooDeepError(step, error) : error;
  }
}

/** The asynchronous form of `withStackOverflowReported`. */
export async function withStackOverflowReportedAsync<T>(
  step: DeepSchemaStep,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw isStackOverflowError(error) ? schemaTooDeepError(step, error) : error;
  }
}
