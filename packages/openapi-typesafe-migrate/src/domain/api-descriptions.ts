import {
  documentStrings,
  isMap,
  isScalar,
  type TreeNode,
  textEntries,
} from "./config-documents.js";
import { referencedProjectPath } from "./relative-references.js";

/**
 * API descriptions are data: an example `command`, a `default`, a `script` in them is not a
 * command that anything runs, and a change to it reaches the generated JSDoc. They are not
 * migrated: the documents with a top-level key of their format, and the files that such a
 * document reaches by `$ref` (a split layout keeps a schema in `components/schemas/Job.yaml`,
 * which has no such key).
 */

/**
 * The top-level keys of an API description: OpenAPI 3, Swagger 2, AsyncAPI, and the OpenAPI
 * Overlay and Arazzo documents that are written next to them.
 */
const API_DESCRIPTION_KEYS: readonly string[] = [
  "openapi",
  "swagger",
  "asyncapi",
  "overlay",
  "arazzo",
];
const API_DESCRIPTION_KEY_SET: ReadonlySet<string> = new Set(API_DESCRIPTION_KEYS);

/**
 * A line that can start such a key, in YAML (`openapi: 3.1.0`) or JSON (`"openapi": "3.1.0"`).
 * It only tells which texts to parse: the parsed keys decide.
 */
const DESCRIPTION_KEY_LINE_RE = new RegExp(
  `^[ \\t{]*["']?(?:${API_DESCRIPTION_KEYS.join("|")})["']?[ \\t]*:`,
  "m",
);

/** Whether a text may be an API description, so it is worth parsing to tell. */
export const mayBeApiDescription = (text: string): boolean => DESCRIPTION_KEY_LINE_RE.test(text);

/**
 * The version that each of these specs writes under its key (`openapi: 3.1.0`,
 * `swagger: "2.0"`, `asyncapi: 3.0.0`, `overlay: 1.0.0`, `arazzo: 1.0.1`): major and minor, an
 * optional patch and pre-release. A map there (a GitLab job named `openapi`) is no API
 * description.
 */
const SPEC_VERSION_RE = /^\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?$/;

/** True when a document of the stream has a top-level key of an API description with a version. */
export const isApiDescription = (documents: readonly TreeNode[]): boolean =>
  documents.some(
    (root) =>
      isMap(root) &&
      textEntries(root).some(
        ({ key, value }) =>
          API_DESCRIPTION_KEY_SET.has(key.value) &&
          isScalar(value) &&
          SPEC_VERSION_RE.test(value.value),
      ),
  );

const REF_KEY = "$ref";
const FRAGMENT_START = "#";

/**
 * The project files that the `$ref` values of the document at `path` name, without their
 * fragment (`./schemas/Job.yaml#/Job`). A reference inside the document (`#/components/…`), a URL
 * and a path outside the project name no file of it.
 */
export function referencedFiles(path: string, documents: readonly TreeNode[]): string[] {
  return documentStrings(documents)
    .filter((string) => string.path.at(-1) === REF_KEY)
    .flatMap(({ value }) => {
      // `#/components/…` leaves no file part, which names the folder of the document: no file.
      const file = value.split(FRAGMENT_START)[0] ?? "";
      const referenced = referencedProjectPath(path, file);
      return referenced === undefined ? [] : [referenced];
    });
}
