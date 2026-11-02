import { expect, test } from "vitest";
import { signIn } from "../src/session";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

test("signIn logs in and authenticates later requests", async () => {
  const fake = createFakeFetch((request) =>
    new URL(request.url).pathname === "/v1/auth/login"
      ? json({ accessToken: "abc", expiresIn: 60 })
      : json(REX),
  );
  const client = createTestClient(fake);

  await signIn(client, "ann", "secret");
  await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  const [login, later] = fake.requests;
  expect(login?.method).toBe("POST");
  expect(JSON.parse(login?.body ?? "{}")).toEqual({ username: "ann", password: "secret" });
  expect(later?.headers.get("Authorization")).toBe("Bearer abc");
});

test("signIn throws on 401 and registers no middleware", async () => {
  const fake = createFakeFetch((request) =>
    new URL(request.url).pathname === "/v1/auth/login"
      ? json({ code: "unauthorized", message: "Wrong password" }, 401)
      : json(REX),
  );
  const client = createTestClient(fake);

  await expect(signIn(client, "ann", "wrong")).rejects.toThrow(Error);
  await client.GET("/pets/{petId}", { params: { path: { petId: 1 } } });

  expect(fake.requests[1]?.headers.get("Authorization")).toBeNull();
});
