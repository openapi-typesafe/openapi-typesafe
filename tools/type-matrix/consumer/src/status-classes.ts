import createClient from "openapi-typesafe-fetch";

/**
 * Statuses outside the lists the types once classified by (205, 208, 226, 419): a success or an
 * error by the first digit, on every TypeScript of the matrix; checked, never run.
 */

type Paths = {
  "/reports": {
    post: {
      responses: {
        205: { content: { "application/json": { reset: true } } };
        208: { content: { "application/json": { reported: true } } };
        226: { content: { "application/json": { delta: string } } };
        419: { content: { "application/json": { reason: string } } };
      };
    };
  };
};

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });

type ReportData = { reset: true } | { reported: true } | { delta: string };

/** `true` only when the two types are the same: `never` data or error would fit any annotation. */
type IsSame<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export async function sendReport(): Promise<boolean> {
  const { data, error } = await client.POST("/reports");
  const isData: IsSame<typeof data, ReportData | undefined> = true;
  const isError: IsSame<typeof error, { reason: string } | undefined> = true;
  return isData && isError;
}
