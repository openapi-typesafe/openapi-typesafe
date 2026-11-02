import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";

const DATE = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Date"));
const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

/** Generate the API types; date-time strings become `Date`. */
export async function generateSchema(source: URL | string): Promise<string> {
  const ast = await openapiTS(source, {
    transform(schemaObject) {
      if (schemaObject.format === "date-time") {
        return schemaObject.nullable ? ts.factory.createUnionTypeNode([DATE, NULL]) : DATE;
      }
      return undefined;
    },
  });
  return astToString(ast);
}
