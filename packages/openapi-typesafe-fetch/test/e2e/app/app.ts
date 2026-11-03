import createClient from "../../../src/index.js";
import type { paths } from "./schemas/e2e.js";

const client = createClient<paths>({
  baseUrl: "/api/v1",
});

/**
 * Test 1: GET /api/v1/get
 */
async function testGet() {
  const { data } = await client.GET("/get");
  if (!data) {
    throw new Error("/get: No data");
  }
}

/**
 * Test 2: POST /api/v1/post
 */
async function testPost() {
  const { data } = await client.POST("/post", { body: { message: "POST" } });
  if (!data) {
    throw new Error("/post: No data");
  }
}

/**
 * Test 3: POST /api/v1/multi-form, a file upload. With `--binary-as-blob` the file field is a
 * `Blob`, and the client turns the object into `FormData` with the platform's boundary.
 */
async function testMultiForm() {
  const { data } = await client.POST("/multi-form", {
    headers: { "Content-Type": "multipart/form-data" },
    body: {
      message: "Form",
      file: new File(["Hello, World!"], "hello.txt", { type: "text/plain" }),
    },
  });
  if (!data) {
    throw new Error("/multi-form: No data");
  }
}

/**
 * Test 4: GET /api/v1/download, a binary response read as a `Blob`.
 */
async function testDownload() {
  const { data } = await client.GET("/download", { parseAs: "blob" });
  const bytes = data === undefined ? [] : [...new Uint8Array(await data.arrayBuffer())];
  if (bytes.join(",") !== "1,2,255") {
    throw new Error(`/download: unexpected bytes ${bytes.join(",")}`);
  }
}

// run all tests immediately on load
(async () => {
  await Promise.all([testGet(), testPost(), testMultiForm(), testDownload()]);

  // add element Playwright is waiting for
  const div = document.createElement("div");
  div.setAttribute("data-status", "success");
  div.innerHTML = "Success";
  document.body.appendChild(div);
})();
