// A CommonJS TypeScript file that imports the package by name (resolved through its own exports).
import openapiTS = require("openapi-typesafe");

export const generate: typeof openapiTS.default = openapiTS.default;
