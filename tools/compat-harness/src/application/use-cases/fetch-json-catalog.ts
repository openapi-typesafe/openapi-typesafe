import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import { parseCatalogJson } from "../catalogs.ts";
import type { HttpClient } from "../ports.ts";

const HTTP_OK = 200;

/** Download a catalog and parse it as JSON. A non-200 status or invalid JSON is a catalog error. */
export async function fetchJsonCatalog(http: HttpClient, url: string): Promise<unknown> {
  const response = await http.getText(url);
  if (response.status !== HTTP_OK) {
    throw new HarnessError(
      HarnessErrorCode.CatalogInvalid,
      `${url} returned HTTP ${response.status}`,
    );
  }
  return parseCatalogJson(response.body, url);
}
