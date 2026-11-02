/** The text of `--help`, as in the original CLI; long lines are split only in this source. */
export const HELP_TEXT = [
  "Usage",
  "  $ openapi-typesafe [input] [options]",
  "",
  "Options",
  "  --help                     Display this",
  "  --version                  Display the version",
  "  --redocly [path], -c       Specify path to Redocly config (default: redocly.yaml)",
  "  --output, -o               Specify output file (if not specified in redocly.yaml)",
  "  --enum                     Export true TS enums instead of unions",
  "  --enum-values              Export enum values as arrays",
  "  --conditional-enums        Only generate true TS enums when enum" +
    " metadata is available (default: false)",
  "  --dedupe-enums             Dedupe enum types when `--enum=true` is set",
  "  --check                    Check that the generated types are" +
    " up-to-date. (default: false)",
  "  --export-type, -t          Export top-level `type` instead of `interface`",
  "  --immutable                Generate readonly types",
  "  --additional-properties    Treat schema objects as if `additionalProperties: true` is set",
  "  --empty-objects-unknown    Generate `unknown` instead of" +
    " `Record<string, never>` for empty objects",
  "  --default-non-nullable     Set to `false` to ignore default values" +
    " when generating non-nullable types",
  "  --properties-required-by-default",
  "                             Treat schema objects as if `required` is" +
    " set to all properties by default",
  "  --array-length             Generate tuples using array minItems / maxItems",
  "  --path-params-as-types     Convert paths to template literal types",
  "  --alphabetize              Sort object keys alphabetically",
  "  --exclude-deprecated       Exclude deprecated types",
  "  --root-types               Export schemas types at root level",
  "  --root-types-no-schema-prefix",
  '                             Do not add "Schema" prefix to types at' +
    " the root level (should only be used with --root-types)",
  "  --root-types-keep-casing   Keep casing of root types (should only be" +
    " used with --root-types)",
  "  --make-paths-enum          Generate ApiPaths enum for all paths",
  "  --read-write-markers       Generate $Read/$Write markers for" +
    " readOnly/writeOnly properties",
  "",
].join("\n");
