import { readFileSync } from "node:fs";
import openapiTS, { isOpenAPITypesafeError } from "openapi-typesafe";
import { expect, test } from "vitest";
import { checkDocument } from "../scripts/validate";

const GENERATION_TIMEOUT_MS = 30_000;
const BROKEN_DOCUMENT = `
openapi: 3.1.0
info: { title: Broken, version: "1" }
paths:
  /x:
    get:
      responses:
        "200": { $ref: "#/components/responses/Missing" }
`;

async function expectedCode(document: string): Promise<string> {
  try {
    await openapiTS(document, { silent: true });
  } catch (error) {
    if (isOpenAPITypesafeError(error)) {
      return error.code;
    }
  }
  throw new Error("the document was expected to fail with a typed error");
}

test("checkDocument accepts a valid document", { timeout: GENERATION_TIMEOUT_MS }, async () => {
  const document = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");

  expect(await checkDocument(document)).toEqual({ ok: true });
});

test("checkDocument returns the error code", { timeout: GENERATION_TIMEOUT_MS }, async () => {
  const code = await expectedCode(BROKEN_DOCUMENT);

  expect(await checkDocument(BROKEN_DOCUMENT)).toEqual({ ok: false, code });
});
