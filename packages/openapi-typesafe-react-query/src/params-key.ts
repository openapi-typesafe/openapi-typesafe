/**
 * The `params` of a query key (ADR-046), read the way the fetch client reads them to send them:
 * `params.query`, `params.path` and `params.header` by name, a path record by the names of the
 * path template, a query record by `for..in` and a header record by its own members. A value the
 * client reads behind a getter of a class is then in the key too: two requests that sent
 * different URLs shared one entry when the key read own enumerable members alone.
 */
import {
  type Ancestors,
  attempt,
  definedMembers,
  enumerableNames,
  keyOf,
  readMembers,
} from "./key-read.js";
import { objectKey, pathRecordKey, sentMembers } from "./param-key.js";

/** The `params` record the fetch client sends as headers, through no serializer. */
const HEADER_RECORD = "header";
/** The `params` record that fills the path template. */
const PATH_RECORD = "path";
/** The records of `params` that the fetch client reads by name. */
const NAMED_RECORDS: readonly string[] = ["query", PATH_RECORD, HEADER_RECORD];
/** A parameter of a path template, as the fetch client finds it: `{name}`, `{.name*}`, ... */
const PATH_PARAM_RE = /\{[^{}]+\}/g;
/** What a template parameter has around its name: a `.` or `;` style and an explode `*`. */
const PATH_PARAM_MARKS_RE = /^[.;]|\*$/g;

/** The parameter names of a path template, as the fetch client's path serializer reads them. */
export function pathParamNames(template: string): string[] {
  return Array.from(template.match(PATH_PARAM_RE) ?? [], (match) =>
    match.slice(1, -1).replace(PATH_PARAM_MARKS_RE, ""),
  );
}

/**
 * A `params` record by what it sends, or undefined when it sends nothing. Any object record, also
 * a class instance, is read by its members, as the fetch client reads it; a record kept as it is
 * held `NaN` as `null` and a bigint, which the hash throws for. A query or path record goes whole
 * to a serializer of the client, so it has the other forms of `objectKey`; a path record also has
 * the value of each template name (`pathRecordKey`). A header record goes to none; its names are
 * folded to lower case, the last value of a name kept, as the client sets them one after the
 * other into `Headers`, which match a name in any letter case.
 */
function recordKey(location: string, record: unknown, context: RecordContext): unknown {
  if (typeof record !== "object" || record === null) {
    return record;
  }
  if (location === PATH_RECORD) {
    return definedMembers(pathRecordKey(record, context.pathNames, context.ancestors));
  }
  if (location !== HEADER_RECORD) {
    return definedMembers(objectKey(record, context.ancestors, enumerableNames));
  }
  const members = Object.entries(sentMembers(record, context.ancestors));
  return definedMembers(
    Object.fromEntries(members.map(([name, value]) => [name.toLowerCase(), value])),
  );
}

/** Where a record of `params` is read: the walk it is in and the names of the path template. */
interface RecordContext {
  readonly ancestors: Ancestors;
  readonly pathNames: readonly string[];
}

/**
 * The records of `params` as the fetch client reads them: the named ones by name, also behind a
 * getter, and the other own enumerable members, which a middleware gets with `params`.
 */
function paramsRecords(params: object): (readonly [string, unknown])[] {
  const named = NAMED_RECORDS.map(
    (name) => [name, attempt(() => (params as Record<string, unknown>)[name])] as const,
  );
  const others = readMembers(params).filter(([name]) => !NAMED_RECORDS.includes(name));
  return [...named, ...others];
}

/**
 * The `params` of an init by its records as `recordKey`, without the records that send nothing:
 * `{}`, `{ query: {} }` and `{ query: { cursor: undefined } }` send the request of no `params`,
 * since the fetch client reads a missing record as an empty one. Undefined when no record is
 * left. `pathNames` are the parameter names of the path template.
 */
export function paramsKey(
  params: unknown,
  ancestors: Ancestors,
  pathNames: readonly string[],
): unknown {
  if (typeof params !== "object" || params === null) {
    return params;
  }
  const records = paramsRecords(params).map(([location, record]) => [
    location,
    keyOf(record, ancestors, (value, inner) =>
      recordKey(location, value, { ancestors: inner, pathNames }),
    ),
  ]);
  return definedMembers(Object.fromEntries(records));
}
