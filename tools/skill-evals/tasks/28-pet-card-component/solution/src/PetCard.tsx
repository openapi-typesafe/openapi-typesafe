import type { OpenapiQueryClient } from "openapi-typesafe-react-query";
import type { paths } from "./api/schema";

/** Shows the name of one pet. */
export function PetCard({ $api, petId }: { $api: OpenapiQueryClient<paths>; petId: number }) {
  const { data, isPending, isError } = $api.useQuery("get", "/pets/{petId}", {
    params: { path: { petId } },
  });
  if (isPending) {
    return <p>Loading…</p>;
  }
  if (isError) {
    return <p>Pet not found</p>;
  }
  return <h2>{data.name}</h2>;
}
