import { type Page, type Request, test } from "@playwright/test";

// note: these tests load Chrome, Firefox, and Safari in Playwright to test a browser-realistic runtime.
// the frontend is prepared via Vite to create a production-accurate app (and throw add’l type errors)
// the backend is mocked here, in Playwright

test("basic", async ({ page }) => {
  // mock API
  await mockAPI(page);

  // throw on any error
  page.on("pageerror", (error) => {
    throw error;
  });

  // load page
  await page.goto("/");

  // wait for element
  await page.waitForSelector('[data-status="success"]');
});

/** Mock API */
async function mockAPI(page: Page) {
  await Promise.all([
    // GET /api/v1/get
    page.route("/api/v1/get", (route) => route.fulfill({ status: 200, body: JSON.stringify({ message: "success" }) })),
    // POST /api/v1/post
    page.route("/api/v1/post", (route) => route.fulfill({ status: 200, body: JSON.stringify({ message: "success" }) })),
    // POST /api/v1/multi-form: answers 400 unless the body is a multipart upload of the file
    page.route("/api/v1/multi-form", (route) => {
      const isUpload = isMultipartUpload(route.request());
      return route.fulfill({
        status: isUpload ? 200 : 400,
        body: JSON.stringify({ message: isUpload ? "success" : "not a multipart upload" }),
      });
    }),
    // GET /api/v1/download
    page.route("/api/v1/download", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from([1, 2, 255]),
      }),
    ),
  ]);
}

/** Whether the request is the app's file upload, with a boundary the browser set. */
function isMultipartUpload(request: Request): boolean {
  const contentType = request.headers()["content-type"] ?? "";
  const body = request.postData() ?? "";
  return (
    /^multipart\/form-data; boundary=/.test(contentType) &&
    body.includes('filename="hello.txt"') &&
    body.includes("Hello, World!") &&
    body.includes('name="message"')
  );
}
