import createClient from "openapi-typesafe-fetch";
import type { paths } from "../../../../packages/openapi-typesafe/examples/path-params-overlaps.js";

/**
 * `--path-params-as-types` with keys that a template also matches (roadmap R10.2): `paths` is an
 * intersection, and each key keeps its own type; checked, never run.
 */

type Json<Item, Code extends 200 = 200> = Item extends {
  responses: { [K in Code]: { content: { "application/json": infer Body } } };
}
  ? Body
  : never;

type App = Json<paths[`/apps/${string}`]["get"]>;
type Regions = Json<paths["/apps/regions"]["get"]>;

export const app: App = { id: "a1" };
export const regions: Regions = ["nyc", "ams"];

// @ts-expect-error a literal key keeps its own type, not the template's.
export const regionsAsApp: Regions = { id: "a1" };

const client = createClient<paths>({ baseUrl: "https://api.example.com" });

export async function listRegions(): Promise<number> {
  const { data } = await client.GET("/apps/regions");
  return data?.length ?? 0;
}

export async function readApp(id: string): Promise<string | undefined> {
  const { data } = await client.GET(`/apps/${id}`, { params: { path: { app_id: id } } });
  return data?.id;
}
