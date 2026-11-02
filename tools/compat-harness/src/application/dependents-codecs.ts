import { z } from "zod";
import {
  DEPENDENTS_SCHEMA_VERSION,
  type DependentsManifest,
  HarnessStepName,
  PackageManager,
} from "../domain/dependent-project.ts";
import {
  type DependentResult,
  DependentStatus,
  GeneratedFileStatus,
  StepStatus,
} from "../domain/dependent-result.ts";
import { decode } from "./codecs.ts";

const RESERVED_STEP_NAMES: readonly string[] = Object.values(HarnessStepName);

/** A relative path that stays inside the checkout: no absolute paths, no `..` segments. */
const RelativePathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !path.split("/").includes(".."), {
    message: "must be a relative path inside the project",
  });

const StepSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9:-]+$/)
    .refine((name) => !RESERVED_STEP_NAMES.includes(name), { message: "is a reserved step name" }),
  command: z.array(z.string().min(1)).min(1),
});

const hasUniqueValues = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const ProjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  repository: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  packageManager: z.enum(Object.values(PackageManager)),
  directory: RelativePathSchema,
  steps: z
    .array(StepSchema)
    .min(1)
    .refine((steps) => hasUniqueValues(steps.map((step) => step.name)), {
      message: "step names must be unique",
    }),
  generatedFiles: z.array(RelativePathSchema),
  notes: z.string(),
});

const DependentsManifestSchema = z.object({
  schemaVersion: z.literal(DEPENDENTS_SCHEMA_VERSION),
  projects: z
    .array(ProjectSchema)
    .refine((projects) => hasUniqueValues(projects.map((project) => project.id)), {
      message: "project ids must be unique",
    }),
});

const StepResultSchema = z.object({
  name: z.string(),
  status: z.enum(Object.values(StepStatus)),
  durationMs: z.number().nonnegative(),
  outputExcerpt: z.string(),
});

const DependentResultsSchema = z.array(
  z.object({
    projectId: z.string(),
    repository: z.string(),
    commit: z.string(),
    status: z.enum(Object.values(DependentStatus)),
    failedStep: z.string().nullable(),
    baseline: z.array(StepResultSchema),
    candidate: z.array(StepResultSchema),
    generatedFiles: z.array(
      z.object({
        path: z.string(),
        status: z.enum(Object.values(GeneratedFileStatus)),
        firstDifferentLine: z.number().int().positive().nullable(),
        differentLineCount: z.number().int().nonnegative(),
        intentionalDifferenceIds: z.array(z.string()),
      }),
    ),
  }),
);

export function decodeDependentsManifest(text: string): DependentsManifest {
  return decode(DependentsManifestSchema, text, "dependents manifest");
}

export function decodeDependentResults(text: string): DependentResult[] {
  return decode(DependentResultsSchema, text, "dependent results");
}
