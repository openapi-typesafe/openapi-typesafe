import fs from "node:fs";
import path from "node:path";
import { createConfig, findConfig, loadConfig } from "@redocly/openapi-core";
import type {
  RedoclyConfig,
  RedoclyConfigSource,
} from "../../application/ports/redocly-config-source.js";

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
    return loadConfig({ configPath });
  }

  createDefault(): Promise<RedoclyConfig> {
    return createConfig({}, { extends: ["minimal"] });
  }
}

/** Find and load `redocly.yaml` relative to the directory `cwd`. */
export function createRedoclyConfigSource(cwd: string): RedoclyConfigSource {
  return new RedoclyConfigFiles(cwd);
}
