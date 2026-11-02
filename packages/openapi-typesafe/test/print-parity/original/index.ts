// The fork-base root transformer, kept as the reference for the root parity test
// (ENGINEERING_PLAN Phase 5: no behavior changes). Not linted: it is upstream code as it was.
import { performance } from "node:perf_hooks";
import ts, { type InterfaceDeclaration, type TypeLiteralNode } from "typescript";
import { NEVER, STRING, stringToAST, tsModifiers, tsRecord } from "./lib/ts.js";
import { createRef, debug } from "./lib/utils.js";
import type { GlobalContext, OpenAPI3 } from "./lib/types.js";
import transformComponentsObject from "./components-object.js";
import makeApiPathsEnum from "./paths-enum.js";
import transformPathsObject from "./paths-object.js";
import transformSchemaObject from "./schema-object.js";
import transformWebhooksObject from "./webhooks-object.js";

type SchemaTransforms = keyof Pick<OpenAPI3, "paths" | "webhooks" | "components" | "$defs">;

const transformers: Record<SchemaTransforms, (node: any, options: GlobalContext) => ts.Node | ts.Node[]> = {
  paths: transformPathsObject,
  webhooks: transformWebhooksObject,
  components: transformComponentsObject,
  $defs: (node, options) => transformSchemaObject(node, { path: createRef(["$defs"]), ctx: options, schema: node }),
};

// Inline helper types for readOnly/writeOnly markers (when readWriteMarkers is enabled).
// Task 7.6 (ADR-014) replaces the fork-base text on purpose; see helper-types.ts.
const READ_WRITE_HELPER_TYPES = `
export type $Read<T> = { readonly $read: T };
export type $Write<T> = { readonly $write: T };
type ReadWritePrimitive = string | number | boolean | bigint | symbol | null | undefined;
type ReadWriteMarkedKeys<T, Marker> = { [K in keyof T]-?: NonNullable<T[K]> extends never ? never : NonNullable<T[K]> extends Marker ? K : never }[keyof T];
type ReadWriteResolveArray<T extends readonly unknown[], Resolved extends "read" | "write"> = T[number][] extends T ? T extends unknown[] ? ReadWriteResolve<T[number], Resolved>[] : readonly ReadWriteResolve<T[number], Resolved>[] : { [K in keyof T]: ReadWriteResolve<T[K], Resolved> };
type ReadWriteResolve<T, Resolved extends "read" | "write"> = Resolved extends "read" ? Readable<T> : Writable<T>;
export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? Readable<U> : T extends ReadWritePrimitive ? T : T extends readonly unknown[] ? ReadWriteResolveArray<T, "read"> : T extends object ? { [K in keyof T as K extends ReadWriteMarkedKeys<T, $Write<any>> ? never : K]: Readable<T[K]> } : T;
export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? Writable<U> : T extends ReadWritePrimitive ? T : T extends readonly unknown[] ? ReadWriteResolveArray<T, "write"> : T extends object ? { [K in keyof T as K extends ReadWriteMarkedKeys<T, $Read<any>> ? never : K]: Writable<T[K]> } & { [K in ReadWriteMarkedKeys<T, $Read<any>>]?: never } : T;
`;

export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext) {
  const type: ts.Node[] = [];

  // Add inline helper types for readOnly/writeOnly markers
  if (ctx.readWriteMarkers) {
    const helperNodes = stringToAST(READ_WRITE_HELPER_TYPES) as ts.Node[];
    type.push(...helperNodes);
  }

  if (ctx.inject) {
    const injectNodes = stringToAST(ctx.inject) as ts.Node[];
    type.push(...injectNodes);
  }

  for (const root of Object.keys(transformers) as SchemaTransforms[]) {
    const emptyObj = ts.factory.createTypeAliasDeclaration(
      /* modifiers      */ tsModifiers({ export: true }),
      /* name           */ root,
      /* typeParameters */ undefined,
      /* type           */ tsRecord(STRING, NEVER),
    );

    if (schema[root] && typeof schema[root] === "object") {
      const rootT = performance.now();
      const subTypes = ([] as ts.Node[]).concat(transformers[root](schema[root], ctx));
      for (const subType of subTypes) {
        if (ts.isTypeNode(subType)) {
          if ((subType as ts.TypeLiteralNode).members?.length) {
            type.push(
              ctx.exportType
                ? ts.factory.createTypeAliasDeclaration(
                    /* modifiers      */ tsModifiers({ export: true }),
                    /* name           */ root,
                    /* typeParameters */ undefined,
                    /* type           */ subType,
                  )
                : ts.factory.createInterfaceDeclaration(
                    /* modifiers       */ tsModifiers({ export: true }),
                    /* name            */ root,
                    /* typeParameters  */ undefined,
                    /* heritageClauses */ undefined,
                    /* members         */ (subType as TypeLiteralNode).members,
                  ),
            );
            debug(`${root} done`, "ts", performance.now() - rootT);
          } else {
            type.push(emptyObj);
            debug(`${root} done (skipped)`, "ts", 0);
          }
        } else if (ts.isTypeAliasDeclaration(subType)) {
          type.push(subType);
        } else {
          type.push(emptyObj);
          debug(`${root} done (skipped)`, "ts", 0);
        }
      }
    } else {
      type.push(emptyObj);
      debug(`${root} done (skipped)`, "ts", 0);
    }
  }

  // inject
  let hasOperations = false;
  for (const injectedType of ctx.injectFooter) {
    if (!hasOperations && (injectedType as InterfaceDeclaration)?.name?.escapedText === "operations") {
      hasOperations = true;
    }
    type.push(injectedType);
  }
  if (!hasOperations) {
    // if no operations created, inject empty operations type
    type.push(
      ts.factory.createTypeAliasDeclaration(
        /* modifiers      */ tsModifiers({ export: true }),
        /* name           */ "operations",
        /* typeParameters */ undefined,
        /* type           */ tsRecord(STRING, NEVER),
      ),
    );
  }

  if (ctx.makePathsEnum && schema.paths) {
    type.push(makeApiPathsEnum(schema.paths));
  }

  return type;
}
