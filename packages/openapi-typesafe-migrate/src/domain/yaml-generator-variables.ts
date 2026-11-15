import type { DocumentString } from "./config-documents.js";
import { runsGenerator } from "./file-variables.js";
import { shellCommands } from "./shell-words.js";
import { environmentEntries } from "./yaml-environment-entries.js";
import { referencedVariables, type YamlCommandFile } from "./yaml-environments.js";
import { shellText } from "./yaml-shell-text.js";

/**
 * The variables that a YAML file sets to the old generator in its variable maps (a GitLab
 * `variables`, a Compose `environment`, a workflow `env`). Its tool gives them to every program a
 * job runs, so a script that the file does not hold can run the generator through them
 * (`$GEN api.yaml -it` in `scripts/gen.sh`).
 */
export function generatorVariables(
  text: string,
  strings: readonly DocumentString[],
  { environment }: YamlCommandFile,
): string[] {
  const entries = environmentEntries(strings, environment);
  return [...entries].flatMap(([value, entry]) => {
    const shell = value.isEscaped ? value.value : shellText(text, value);
    return shellCommands(shell.slice(entry.head)).some(runsGenerator) ? [entry.name] : [];
  });
}

const NAME_END = "(?![A-Za-z0-9_])";
const SPECIAL_CHARACTERS_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * Whether a text expands one of the variables `names`, as a shell (`$GEN`, `${GEN}`), make
 * (`$(GEN)`), cmd.exe (`%GEN%`) or PowerShell (`$env:GEN`) reads it, or as the tool of a YAML
 * file kind replaces it (`{{.GEN}}`, an Azure `$(gen)`, `${{ env.GEN }}`, yaml-environments.ts).
 */
export function usesVariable(text: string, names: ReadonlySet<string>): boolean {
  if (names.size === 0) {
    return false;
  }
  const alternatives = [...names].map((name) => name.replace(SPECIAL_CHARACTERS_RE, "\\$&"));
  const name = `(?:${alternatives.join("|")})`;
  const expansion = `\\$(?:\\{|\\(|env:)?${name}${NAME_END}|%${name}%`;
  return (
    new RegExp(expansion).test(text) || referencedVariables(text).some((found) => names.has(found))
  );
}
