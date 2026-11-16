import { ERROR_CODES, OpenAPITypesafeError } from "../../../domain/errors.js";

/** A property whose value is neither a Schema Object nor a boolean. */
export class InvalidPropertyError extends OpenAPITypesafeError {
  constructor(path: string | undefined, key: string, value: unknown) {
    const received = Array.isArray(value) ? "Array" : typeof value;
    super({
      code: ERROR_CODES.SCHEMA_PROPERTY_INVALID,
      message:
        `${path}: invalid property ${key}. ` + `Expected Schema Object or boolean, got ${received}`,
      details: { path, property: key, received },
    });
    this.name = "InvalidPropertyError";
  }
}
