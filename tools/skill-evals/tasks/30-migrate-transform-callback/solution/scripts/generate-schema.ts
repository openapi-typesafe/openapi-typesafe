import openapiTS, { astToString } from "openapi-typesafe";

/** Generate the API types; date-time strings become `Date`. */
export async function generateSchema(source: URL | string): Promise<string> {
  const ast = await openapiTS(source, {
    irCallbacks: true,
    transform(schemaObject) {
      if (schemaObject.format === "date-time") {
        return schemaObject.nullable ? "Date | null" : "Date";
      }
      return undefined;
    },
  });
  return astToString(ast);
}
