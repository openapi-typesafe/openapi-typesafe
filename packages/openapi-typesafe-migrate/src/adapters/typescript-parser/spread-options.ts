import ts from "@typescript/typescript6";
import { lineAt, type ManualStep } from "../../domain/migration-findings.js";
import type { FileBindings } from "./file-bindings.js";
import { unwrapped } from "./generator-calls.js";
import {
  IR_CALLBACKS_OPTION,
  legacyCallbackSteps,
  propertyNamed,
  TRANSFORM,
} from "./option-properties.js";

/**
 * The objects that `openapiTS` options take keys from (`{ ...base }`). An object literal, also in
 * a `const` of the file, is read like the options themselves: its legacy callbacks are reported,
 * and a `transform` in it is kept, since the call it reaches is not where it is written. Any other
 * spread (an import, a call, a parameter) may bring callbacks the tool cannot see, so it is
 * reported.
 */

/** The object literal a spread takes its keys from, when the file writes it. */
function spreadObject(
  expression: ts.Expression,
  bindings: FileBindings,
): ts.ObjectLiteralExpression | undefined {
  const { value } = unwrapped(expression);
  if (ts.isObjectLiteralExpression(value)) {
    return value;
  }
  const binding = ts.isIdentifier(value) ? bindings.bindingOf(value) : undefined;
  const initializer =
    binding?.kind === "constant" ? unwrapped(binding.initializer).value : undefined;
  return initializer !== undefined && ts.isObjectLiteralExpression(initializer)
    ? initializer
    : undefined;
}

/** The steps of an object that options take with a spread, and of the spreads inside it. */
function spreadObjectSteps(
  source: ts.ObjectLiteralExpression,
  text: string,
  bindings: FileBindings,
  seen: Set<ts.Node>,
): ManualStep[] {
  if (seen.has(source) || propertyNamed(source, IR_CALLBACKS_OPTION) !== undefined) {
    return [];
  }
  seen.add(source);
  const transform = propertyNamed(source, TRANSFORM);
  const kept: ManualStep[] =
    transform === undefined
      ? []
      : [
          {
            kind: "transform-not-rewritten",
            line: lineAt(text, transform.getStart()),
            reason: "in-spread",
          },
        ];
  return [
    ...legacyCallbackSteps(source, text),
    ...kept,
    ...spreadSteps(source, text, bindings, seen),
  ];
}

/** The manual steps of the spreads of an options object (`{ ...base, alphabetize: true }`). */
export function spreadSteps(
  options: ts.ObjectLiteralExpression,
  text: string,
  bindings: FileBindings,
  seen: Set<ts.Node> = new Set(),
): ManualStep[] {
  return options.properties.filter(ts.isSpreadAssignment).flatMap((spread) => {
    const source = spreadObject(spread.expression, bindings);
    return source === undefined
      ? [{ kind: "options-spread-not-inspected", line: lineAt(text, spread.getStart()) } as const]
      : spreadObjectSteps(source, text, bindings, seen);
  });
}
