import { z } from "zod";
import { type CorpusEntryId, CorpusSource } from "../domain/corpus-entry.ts";
import type { CorpusShard } from "../domain/corpus-shard.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import { type CorpusManifest, MANIFEST_SCHEMA_VERSION } from "../domain/manifest.ts";
import { SUPPORTED_OPENAPI_LINES } from "../domain/openapi-version.ts";
import { type OptInCheckResult, OptInCheckStatus } from "../domain/opt-in-check.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  type GenerationResult,
  GenerationStatus,
} from "../domain/run-result.ts";

/**
 * JSON codecs for the files the harness writes and reads back. Files can be edited by hand or come
 * from an older harness version, so they are validated on read like any other external input.
 */

const CorpusEntryIdSchema = z
  .string()
  .min(1)
  .transform((id) => id as CorpusEntryId);

const ManifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  entries: z.array(
    z.object({
      id: CorpusEntryIdSchema,
      source: z.enum(Object.values(CorpusSource)),
      name: z.string(),
      apiVersion: z.string(),
      openapiVersion: z.string(),
      openapiLine: z.enum(SUPPORTED_OPENAPI_LINES),
      sourceUrl: z.url(),
      isPreferred: z.boolean(),
      sha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .nullable(),
    }),
  ),
});

const GenerationResultsSchema = z.array(
  z.object({
    entryId: CorpusEntryIdSchema,
    optionSetId: z.string(),
    status: z.enum(Object.values(GenerationStatus)),
    durationMs: z.number().nonnegative(),
    errorExcerpt: z.string(),
  }),
);

const ComparisonResultsSchema = z.array(
  z.object({
    entryId: CorpusEntryIdSchema,
    optionSetId: z.string(),
    status: z.enum(Object.values(ComparisonStatus)),
    firstDifferentLine: z.number().int().positive().nullable(),
    differentLineCount: z.number().int().nonnegative(),
    differentTypeNames: z.array(z.string()),
    // Results written before task 7.4 have no such field.
    intentionalDifferenceIds: z.array(z.string()).default([]),
  }),
);

const OptInResultsSchema = z.array(
  z.object({
    entryId: CorpusEntryIdSchema,
    optionSetId: z.string(),
    baselineOptionSetId: z.string(),
    status: z.enum(Object.values(OptInCheckStatus)),
    errorCount: z.number().int().nonnegative().nullable(),
    baselineErrorCount: z.number().int().nonnegative().nullable(),
  }),
);

const ShardDescriptorSchema = z
  .object({ index: z.number().int().positive(), count: z.number().int().positive() })
  .refine((shard) => shard.index <= shard.count, "index must not be greater than count");

/** Parse JSON text and validate it; any problem is a STORED_FILE_INVALID error. */
export function decode<T>(schema: z.ZodType<T>, text: string, fileDescription: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      `${fileDescription} is not valid JSON: ${reason}`,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const message = `${fileDescription} is invalid: ${z.prettifyError(parsed.error)}`;
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, message);
  }
  return parsed.data;
}

/** Stable JSON text: two-space indent and a final newline, so committed files diff cleanly. */
export function encodeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function decodeManifest(text: string): CorpusManifest {
  return decode(ManifestSchema, text, "corpus manifest");
}

export function decodeGenerationResults(text: string): GenerationResult[] {
  return decode(GenerationResultsSchema, text, "generation results");
}

export function decodeComparisonResults(text: string): ComparisonResult[] {
  return decode(ComparisonResultsSchema, text, "comparison results");
}

export function decodeOptInResults(text: string): OptInCheckResult[] {
  return decode(OptInResultsSchema, text, "opt-in results");
}

export function decodeShardDescriptor(text: string): CorpusShard {
  return decode(ShardDescriptorSchema, text, "shard descriptor");
}
