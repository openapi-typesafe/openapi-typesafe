import ts from "@typescript/typescript6";
import { lineAt, type ManualStep } from "../../domain/migration-findings.js";

/** The properties of an `openapiTS` options object that the rewriter looks for. */

export const TRANSFORM = "transform";
/** The legacy callbacks that are only reported: they have no IR form the tool can write. */
export const LEGACY_ONLY_CALLBACKS = ["postTransform", "transformProperty"] as const;
export const IR_CALLBACKS_OPTION = "irCallbacks";

/** The property of an object literal with the name `name`, written as a name or a string. */
export function propertyNamed(
  options: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return options.properties.find((property) => {
    const key = property.name;
    return (
      key !== undefined && (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === name
    );
  });
}

/** One step for each `postTransform` and `transformProperty` of the options. */
export function legacyCallbackSteps(
  options: ts.ObjectLiteralExpression,
  text: string,
): ManualStep[] {
  return LEGACY_ONLY_CALLBACKS.flatMap((callback) => {
    const property = propertyNamed(options, callback);
    return property === undefined
      ? []
      : [{ kind: "legacy-callback" as const, line: lineAt(text, property.getStart()), callback }];
  });
}
