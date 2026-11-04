import { keepPreviousData } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * `select` gets the response type (upstream #2852, ADR-022). The issue's shape compiles here and on
 * upstream 0.5.4 (TypeScript 5.5 to 6.0, `.logs/roadmap/R7/`); these checks keep it that way. They
 * are type checks: `tsc` runs them, the hooks are never called.
 */

type Paths = {
  "/admin/roles": {
    get: {
      parameters: { header: { Accept: string } };
      responses: { 200: { content: { "application/json": { data: { data: unknown[] } } } } };
    };
  };
};

type Roles = Paths["/admin/roles"]["get"]["responses"][200]["content"]["application/json"];
type RoleList = { items: unknown[] };

const $api = createClient(createFetchClient<Paths>({ baseUrl: "https://api.example.com" }));
const INIT = { params: { header: { Accept: "application/json" } } };

function toRoleList(response: Roles): RoleList {
  return { items: response.data.data };
}

describe("select inference", () => {
  it("useQuery with a named mapper and placeholderData types data by the mapper", () => {
    const query = () =>
      $api.useQuery("get", "/admin/roles", INIT, { placeholderData: keepPreviousData, select: toRoleList });

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<RoleList | undefined>();
  });

  it("useQuery passes the response type to an inline select", () => {
    const query = () =>
      $api.useQuery("get", "/admin/roles", INIT, {
        select: (response) => {
          expectTypeOf(response).toEqualTypeOf<Roles>();
          return response.data.data.length;
        },
      });

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<number | undefined>();
  });

  it("useSuspenseQuery and queryOptions take a named mapper", () => {
    const suspense = () => $api.useSuspenseQuery("get", "/admin/roles", INIT, { select: toRoleList });
    const options = $api.queryOptions("get", "/admin/roles", INIT, { select: toRoleList });

    expectTypeOf<ReturnType<typeof suspense>["data"]>().toEqualTypeOf<RoleList>();
    expectTypeOf(options.select).toEqualTypeOf<((data: Roles) => RoleList) | undefined>();
  });
});
