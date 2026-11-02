import { webhooksType } from "../application/transform/document/webhooks.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext } from "../lib/transform-context.js";
import type { GlobalContext, WebhooksObject } from "../types.js";

/**
 * Transform the WebhooksObject node. Ported to IR (ENGINEERING_PLAN Phase 5, step 5); this keeps
 * the original name and parameters, returning IR (task 6.2), for deep imports of this module.
 */
export default function transformWebhooksObject(
  webhooksObject: WebhooksObject,
  options: GlobalContext,
): IrType {
  return webhooksType(webhooksObject, createTransformContext(options));
}
