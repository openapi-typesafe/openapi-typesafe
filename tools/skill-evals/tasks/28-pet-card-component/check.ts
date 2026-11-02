import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import createQueryClient, { type OpenapiQueryClient } from "openapi-typesafe-react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import type { paths } from "../src/api/schema";
import { PetCard } from "../src/PetCard";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

function render(queryClient: QueryClient, $api: OpenapiQueryClient<paths>): string {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(PetCard, { $api, petId: 1 }),
    ),
  );
}

test("PetCard shows a loading state first", () => {
  const $api = createQueryClient(createTestClient(createFakeFetch(() => json(REX))));

  expect(render(new QueryClient(), $api)).toMatch(/Loading/);
});

test("PetCard shows the pet name in a heading", () => {
  const $api = createQueryClient(createTestClient(createFakeFetch(() => json(REX))));
  const queryClient = new QueryClient();
  const { queryKey } = $api.queryOptions("get", "/pets/{petId}", {
    params: { path: { petId: 1 } },
  });
  queryClient.setQueryData(queryKey, REX);

  expect(render(queryClient, $api)).toMatch(/<h2[^>]*>Rex<\/h2>/);
});
