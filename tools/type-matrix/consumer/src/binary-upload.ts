import createClient from "openapi-typesafe-fetch";
import type { paths } from "../../../../packages/openapi-typesafe/examples/stripe-api-binary-as-blob.js";

/** A file upload and a binary download with `--binary-as-blob` types; checked, never run. */

const client = createClient<paths>({ baseUrl: "https://api.stripe.com" });

export async function uploadDisputeEvidence(file: File): Promise<string | undefined> {
  const { data } = await client.POST("/v1/files", {
    headers: { "Content-Type": "multipart/form-data" },
    body: { file, purpose: "dispute_evidence" },
  });
  return data?.id;
}

export async function downloadQuotePdf(quote: string): Promise<ArrayBuffer | undefined> {
  const { data } = await client.GET("/v1/quotes/{quote}/pdf", {
    params: { path: { quote } },
    parseAs: "blob",
  });
  return data?.arrayBuffer();
}
