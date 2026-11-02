import type ts from "typescript";
import { webhooksType } from "../application/transform/document/webhooks.js";
import { createTransformContext, toLegacyType } from "../lib/transform-context.js";
import type { GlobalContext, WebhooksObject } from "../types.js";

/**
 * Transform the WebhooksObject node. Ported to IR (ENGINEERING_PLAN Phase 5, step 5); this keeps
 * the original signature for the unported root transform.
 */
export default function transformWebhooksObject(webhooksObject: WebhooksObject, options: GlobalContext): ts.TypeNode {
  return toLegacyType(webhooksType(webhooksObject, createTransformContext(options)));
}
