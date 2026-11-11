import fs from "node:fs";
import path from "node:path";
import {
  createConfig,
  findConfig,
  getMergedConfig,
  IGNORE_FILE,
  loadConfig,
} from "@redocly/openapi-core";
import type {
  RedoclyConfig,
  RedoclyConfigSource,
} from "../../application/ports/redocly-config-source.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";

/**
 * The first line of a failure, with the error's name: a YAML error goes on with a snippet of the
 * file, and the name tells a YAML error from a file system one.
 */
function reasonOf(error: unknown): string {
  return String(error).replace(/\n[\s\S]*$/, "");
}

/**
 * The config, or `CLI_CONFIG_INVALID`. Redocly reads the config file and the lint-ignore file
 * next to it (or in the working directory); either can be malformed, and its error does not
 * always name the file, so the message names both.
 */
async function loadedConfig(
  load: () => Promise<RedoclyConfig>,
  configPath: string | undefined,
): Promise<RedoclyConfig> {
  try {
    return await load();
  } catch (error) {
    const config =
      configPath === undefined ? "the default Redocly config" : `the Redocly config ${configPath}`;
    const where = configPath === undefined ? "in the working directory" : "next to it";
    throw new OpenAPITypesafeError({
      code: ERROR_CODES.CLI_CONFIG_INVALID,
      message: `Cannot load ${config} or the ${IGNORE_FILE} ${where}: ${reasonOf(error)}`,
      details: { configPath },
      cause: error,
    });
  }
}

/** The Redocly config port on `@redocly/openapi-core`, resolving paths from `cwd`. */
class RedoclyConfigFiles implements RedoclyConfigSource {
  readonly #cwd: string;

  constructor(cwd: string) {
    this.#cwd = cwd;
  }

  find(explicitPath: string | undefined): string | undefined {
    if (!explicitPath) {
      return findConfig(this.#cwd);
    }
    const resolved = path.resolve(this.#cwd, explicitPath);
    if (!fs.existsSync(resolved)) {
      return undefined;
    }
    return fs.statSync(resolved).isDirectory() ? findConfig(resolved) : resolved;
  }

  load(configPath: string): Promise<RedoclyConfig> {
    return loadedConfig(() => loadConfig({ configPath }), configPath);
  }

  createDefault(): Promise<RedoclyConfig> {
    const create = () =>
      createConfig(
        { rules: { "operation-operationId-unique": { severity: "warn" } } },
        { extends: ["minimal"] },
      );
    return loadedConfig(create, undefined);
  }

  forApi(config: RedoclyConfig, apiName: string): RedoclyConfig {
    return getMergedConfig(config, apiName);
  }
}

/** Find and load `redocly.yaml` relative to the directory `cwd`. */
export function createRedoclyConfigSource(cwd: string): RedoclyConfigSource {
  return new RedoclyConfigFiles(cwd);
}
