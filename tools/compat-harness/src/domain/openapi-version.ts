/**
 * OpenAPI major.minor lines the generator accepts. Swagger 2.0 is out of scope (ENGINEERING_PLAN
 * §1).
 */
export const SUPPORTED_OPENAPI_LINES = ["3.0", "3.1", "3.2"] as const;

export type OpenApiLine = (typeof SUPPORTED_OPENAPI_LINES)[number];

const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.\d+)?/;

/**
 * Return the supported major.minor line of a version string such as "3.1.0", or undefined if
 * unsupported.
 */
export function toOpenApiLine(version: string): OpenApiLine | undefined {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) {
    return undefined;
  }
  const line = `${match[1]}.${match[2]}`;
  return SUPPORTED_OPENAPI_LINES.find((supported) => supported === line);
}
