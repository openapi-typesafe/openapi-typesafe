// `openapi-typesafe-fetch` declares the helper types, and this package names them: one
// declaration, so a value typed with the names of one package fits the names of the other, also
// in generic code, where TypeScript compares two copies of a mapped or conditional type by
// declaration, not by shape (ADR-034). The names are listed: the declaration build turns
// `export type * from` into `export * from`, which would also export the client's functions, and
// this package has no runtime code. `test/exports.test.ts` checks that the list is complete.
export type {
  $Read,
  $Write,
  ErrorResponse,
  ErrorResponseJSON,
  ErrorStatus,
  FilterKeys,
  FindRequiredKeys,
  FirstErrorStatus,
  GetResponseContent,
  GetValueWithDefault,
  HasRequiredKeys,
  HttpMethod,
  IsOperationRequestBodyOptional,
  JSONLike,
  MediaType,
  OKStatusUnion,
  OkStatus,
  OperationObject,
  OperationRequestBody,
  OperationRequestBodyContent,
  OperationRequestBodyMediaContent,
  PathItemObject,
  PathsWithMethod,
  Readable,
  RequestBodyJSON,
  RequiredKeysOf,
  ResponseContent,
  ResponseObjectMap,
  SuccessResponse,
  SuccessResponseJSON,
  Writable,
} from "openapi-typesafe-fetch";
