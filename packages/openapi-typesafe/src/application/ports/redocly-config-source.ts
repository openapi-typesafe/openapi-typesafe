import type { GeneratorOptions } from "../../types.js";

/** The loaded Redocly config, as the generator options take it. */
export type RedoclyConfig = NonNullable<GeneratorOptions["redocly"]>;

/** Where the CLI finds and loads `redocly.yaml` (ENGINEERING_PLAN 4.5). */
export interface RedoclyConfigSource {
  /**
   * The config file to use: `explicitPath` (a file, or a directory to search), or the one found
   * from the working directory. Undefined when there is none.
   */
  find(explicitPath: string | undefined): string | undefined;
  load(configPath: string): Promise<RedoclyConfig>;
  /** The config used when there is no file: the minimal rules. */
  createDefault(): Promise<RedoclyConfig>;
}
