import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import type { GenerationResult } from "../domain/run-result.ts";
import { decodeGenerationResults } from "./codecs.ts";
import { generationResultsPath, outputPath } from "./layout.ts";
import type { FileStore } from "./ports.ts";

/** Reading what the generate command stored in the cache. */

/** The key of one case of a label: its option set and entry. */
export function caseKey(result: Pick<GenerationResult, "optionSetId" | "entryId">): string {
  return `${result.optionSetId}/${result.entryId}`;
}

/** The generation results of a label; fails when the label was never generated. */
export async function readGenerationResults(
  cache: FileStore,
  label: string,
): Promise<GenerationResult[]> {
  const text = await cache.readText(generationResultsPath(label));
  if (text === undefined) {
    const message = `No generation results for "${label}"; run the generate command first`;
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, message);
  }
  return decodeGenerationResults(text);
}

/** The output of a case recorded as ok; fails when the file is missing. */
export async function readOutput(
  cache: FileStore,
  label: string,
  result: GenerationResult,
): Promise<string> {
  const path = outputPath(label, result.optionSetId, result.entryId);
  const text = await cache.readText(path);
  if (text === undefined) {
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      `Output recorded as ok is missing: ${path}`,
    );
  }
  return text;
}
