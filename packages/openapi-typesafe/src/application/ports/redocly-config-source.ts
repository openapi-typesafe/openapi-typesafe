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
  /** The config of a file; fails with `CLI_CONFIG_INVALID` when it or its ignore file is bad. */
  load(configPath: string): Promise<RedoclyConfig>;
  /**
   * The config used when there is no file: the minimal rules. Fails with `CLI_CONFIG_INVALID`
   * when the ignore file of the working directory is bad.
   */
  createDefault(): Promise<RedoclyConfig>;
  /**
   * The config one API of `config` is linted with: the API's own `rules` (and other lint
   * settings) under `apis.<name>` in place of the root's, as `redocly lint <name>` reads them.
   */
  forApi(config: RedoclyConfig, apiName: string): RedoclyConfig;
}
