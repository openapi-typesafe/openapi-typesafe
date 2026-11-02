import { irKeyword } from "../../domain/ir/constructors.js";
import type { IrKeywordType } from "../../domain/ir/nodes.js";

/**
 * The shared `unknown` node. The original compares types with its shared `UNKNOWN` node by
 * identity (a nullable schema whose type *is* that node stays `unknown`), so the transformers use
 * one frozen node for the same cases, and the legacy adapter maps the original constant to it.
 */
export const UNKNOWN_TYPE: IrKeywordType = Object.freeze(irKeyword("unknown"));
