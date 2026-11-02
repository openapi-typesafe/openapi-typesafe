import type { PathsWithMethod, SuccessResponseJSON } from "openapi-typesafe-helpers";
import type { paths } from "./schema";

/** Every path of the document that has a GET operation. */
export type GetPath = PathsWithMethod<paths, "get">;

/** The JSON body of a successful GET of `Path`. */
export type GetData<Path extends GetPath> = SuccessResponseJSON<paths[Path]["get"]>;
