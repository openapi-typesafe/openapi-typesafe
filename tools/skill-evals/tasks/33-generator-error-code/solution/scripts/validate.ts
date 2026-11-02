import openapiTS, { isOpenAPITypesafeError } from "openapi-typesafe";

/** Whether the generator accepts a document; a failure carries the stable error code. */
export async function checkDocument(
  document: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await openapiTS(document, { silent: true });
    return { ok: true };
  } catch (error) {
    if (isOpenAPITypesafeError(error)) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}
