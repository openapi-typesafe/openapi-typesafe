// Uses each deprecated form twice, in two runs; the test checks that Node warns once per code.
import openapiTS, { stringToAST } from "../../src/index.js";

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: { schemas: { Item: { type: "object", properties: { name: { type: "string" } } } } },
} as const;

for (let run = 0; run < 2; run += 1) {
  await openapiTS(DOCUMENT, {
    silent: true,
    irCallbacks: false,
    postTransform: (type) => type,
    transformProperty: (property) => property,
  });
  stringToAST("type A = 1;");
}
