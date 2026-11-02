/** The debug groups of the original `DEBUG=openapi-ts:<group>` output. */
export type DebugGroup = "redoc" | "lint" | "bundle" | "ts";

/**
 * Where the generator reports progress and problems (ENGINEERING_PLAN 4.5). Whether warnings are
 * printed (`silent`) and debug output (`DEBUG`) is decided by the adapter, when it is created.
 */
export interface Logger {
  /**
   * A debug line, with how long the step took when it was measured. A line without a group is
   * written whenever debug output is on.
   */
  debug(message: string, group?: DebugGroup, durationMs?: number): void;
  warn(message: string): void;
  error(message: string): void;
}
