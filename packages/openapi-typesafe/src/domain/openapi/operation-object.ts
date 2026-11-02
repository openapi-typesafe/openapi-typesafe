import type { ParameterOrReference } from "./parameter-object.js";
import type { RequestBodyObject } from "./request-body-object.js";
import type { ResponsesObject } from "./response-object.js";
import type { ReferenceSchema } from "./schema-object.js";

/** The parts of an Operation Object the generator reads (OpenAPI 3.1 §4.8.10). */
export interface OperationObject {
  readonly operationId?: string;
  readonly deprecated?: boolean;
  readonly parameters?: readonly ParameterOrReference[];
  readonly requestBody?: RequestBodyObject | ReferenceSchema;
  readonly responses?: ResponsesObject;
}
