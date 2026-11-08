import { fileURLToPath } from "node:url";
import { astToString } from "../../src/index.js";
import makeApiPathsEnum from "../../src/transform/paths-enum.js";
import type { GlobalContext } from "../../src/types.js";
import type { LooseFixture, TestCase } from "../test-helpers.js";

describe("transformPathsObjectToEnum", () => {
  const tests: TestCase<LooseFixture, GlobalContext>[] = [
    [
      "basic",
      {
        given: {
          "/api/v1/user": {
            get: {},
          },
        },
        want: `export enum ApiPaths {
    GetApiV1User = "/api/v1/user"
}`,
      },
    ],
    [
      "basic with path parameter",
      {
        given: {
          "/api/v1/user/{user_id}": {
            parameters: [
              {
                name: "page",
                in: "query",
                schema: { type: "number" },
                description: "Page number.",
              },
            ],
            get: {
              parameters: [{ name: "user_id", in: "path", description: "User ID." }],
            },
          },
        },
        want: `export enum ApiPaths {
    GetApiV1User = "/api/v1/user/{user_id}"
}`,
      },
    ],
    [
      "with operationId",
      {
        given: {
          "/api/v1/user/{user_id}": {
            parameters: [
              {
                name: "page",
                in: "query",
                schema: { type: "number" },
                description: "Page number.",
              },
            ],
            get: {
              operationId: "GetUserById",
              parameters: [{ name: "user_id", in: "path", description: "User ID." }],
            },
          },
        },
        want: `export enum ApiPaths {
    GetUserById = "/api/v1/user/{user_id}"
}`,
      },
    ],
    [
      "with and without operationId",
      {
        given: {
          "/api/v1/user/{user_id}": {
            parameters: [
              {
                name: "page",
                in: "query",
                schema: { type: "number" },
                description: "Page number.",
              },
            ],
            get: {
              operationId: "GetUserById",
              parameters: [{ name: "user_id", in: "path", description: "User ID." }],
            },
            post: {
              parameters: [{ name: "user_id", in: "path", description: "User ID." }],
            },
          },
        },
        want: `export enum ApiPaths {
    GetUserById = "/api/v1/user/{user_id}",
    PostApiV1User = "/api/v1/user/{user_id}"
}`,
      },
    ],
    [
      "keys that collide name their path parameters, and only those keys change",
      {
        given: {
          "/user/{user_id}": { get: {} },
          "/user": { get: {} },
          "/user/{user_id}/pets": { get: {} },
          "/user/{user_id}/pets/{pet_id}": { get: {} },
          "/order/:order-id": { get: {} },
          "/order": { get: {} },
          "/stores": { get: {} },
        },
        want: `export enum ApiPaths {
    GetUserByUserId = "/user/{user_id}",
    GetUser = "/user",
    GetUserByUserIdPets = "/user/{user_id}/pets",
    GetUserByUserIdPetsByPetId = "/user/{user_id}/pets/{pet_id}",
    GetOrderByOrderId = "/order/:order-id",
    GetOrder = "/order",
    GetStores = "/stores"
}`,
      },
    ],
    [
      "names that still collide get a number, in document order",
      {
        given: {
          "/a": { get: { operationId: "same" } },
          "/b": { get: { operationId: "same" } },
          "/c": { get: { operationId: "GetC" } },
          "/c/": { get: {} },
          "/d": { get: { operationId: "same2" } },
        },
        want: `export enum ApiPaths {
    same = "/a",
    same3 = "/b",
    GetC = "/c",
    GetC2 = "/c/",
    same2 = "/d"
}`,
      },
    ],
    [
      "invalid method",
      {
        given: {
          "/api/v1/user": {
            invalidMethod: {},
          },
        },
        want: `export enum ApiPaths {
}`,
      },
    ],
  ];

  for (const [testName, { given, want, ci }] of tests) {
    test.skipIf(ci?.skipIf)(
      testName,
      async () => {
        const result = astToString(makeApiPathsEnum(given));
        if (want instanceof URL) {
          await expect(result).toMatchFileSnapshot(fileURLToPath(want));
        } else {
          expect(result).toBe(`${want}\n`);
        }
      },
      ci?.timeout,
    );
  }
});
