import { type DocumentPath, type DocumentValue, isDocumentString } from "./config-documents.js";

/**
 * The services of a Compose file whose containers it cannot read alone. `docker compose` merges
 * the files of a folder that it is given (`compose.yaml` and `compose.override.yaml` by default,
 * others with `-f`): a key of a later file replaces the key of the same service in an earlier
 * one. A service's `extends` gives it the keys of another service that it does not set itself.
 * yaml-container-keys.ts reads an `extends` of a service of the same file; a container whose
 * entrypoint or command another file may set is not known, and yaml-entrypoints.ts reports it.
 */

const SERVICES_KEY = "services";
const EXTENDS_KEY = "extends";
const SERVICE_KEY = "service";
const FILE_KEY = "file";
const MERGE_KEY = "<<";
/** The keys of a Compose container: the entrypoint, and the command it gets as arguments. */
const CONTAINER_KEYS: ReadonlySet<string> = new Set(["entrypoint", "command"]);
const SERVICE_PATH_LENGTH = 2;

/** The service of a Compose map path (`services.gen`), or undefined for another map. */
export function serviceOf(path: DocumentPath): string | undefined {
  const isService = path.length === SERVICE_PATH_LENGTH && path[0] === SERVICES_KEY;
  return isService ? String(path[1]) : undefined;
}

/** The key of a service that a value belongs to, past the merge keys (`<<: *base`). */
function serviceKey(path: DocumentPath): string | undefined {
  let index = SERVICE_PATH_LENGTH;
  while (path[index] === MERGE_KEY) {
    index += typeof path[index + 1] === "number" ? 2 : 1;
  }
  return path[0] === SERVICES_KEY ? String(path[index]) : undefined;
}

/** The services of a Compose file that set an entrypoint or a command, by any of their maps. */
export function containerServices(values: readonly DocumentValue[]): ReadonlySet<string> {
  const found = new Set<string>();
  for (const value of values) {
    if (CONTAINER_KEYS.has(serviceKey(value.path) ?? "")) {
      found.add(String(value.path[1]));
    }
  }
  return found;
}

/** What a service's `extends` names: a service, and whether it is one of another file. */
export interface ServiceExtension {
  readonly base: string | undefined;
  readonly isOtherFile: boolean;
}

/** The `extends` of each service: `extends: base`, or `extends: { service, file }`. */
export function serviceExtensions(
  values: readonly DocumentValue[],
): ReadonlyMap<string, ServiceExtension> {
  const found = new Map<string, ServiceExtension>();
  for (const value of values.filter(isDocumentString)) {
    const [services, name, key, field] = value.path;
    if (services === SERVICES_KEY && key === EXTENDS_KEY) {
      const known = found.get(String(name)) ?? { base: undefined, isOtherFile: false };
      const isBase = field === undefined || field === SERVICE_KEY;
      found.set(String(name), {
        base: isBase ? value.value : known.base,
        isOtherFile: known.isOtherFile || field === FILE_KEY,
      });
    }
  }
  return found;
}

/** How a YAML file's kind reads its services: Compose files have them. */
export interface ComposeReading {
  readonly hasServices?: boolean;
  /** The services whose entrypoint or command another file of the folder sets. */
  readonly outsideServices?: ReadonlySet<string>;
}

/** What the containers of a Compose file are read with. */
export interface ComposeServices {
  readonly extensions: ReadonlyMap<string, ServiceExtension>;
  /** The services whose entrypoint or command another file may set. */
  readonly unknown: ReadonlySet<string>;
}

/** Whether a service's container keys may come from another file, also through its bases. */
function isUnknown(name: string, context: UnknownContext, seen: ReadonlySet<string>): boolean {
  const extension = context.extensions.get(name);
  if (context.outside.has(name)) {
    return true;
  }
  if (extension === undefined || context.setsBoth(name)) {
    return false;
  }
  const { base, isOtherFile } = extension;
  const isMissing = base === undefined || !context.services.has(base) || seen.has(base);
  return isOtherFile || isMissing || isUnknown(base, context, new Set([...seen, name]));
}

interface UnknownContext {
  readonly extensions: ReadonlyMap<string, ServiceExtension>;
  readonly outside: ReadonlySet<string>;
  readonly services: ReadonlySet<string>;
  readonly setsBoth: (name: string) => boolean;
}

/** The services of the file whose entrypoint and command are both its own, by its own maps. */
function servicesSettingBoth(values: readonly DocumentValue[]): (name: string) => boolean {
  const keys = new Map<string, Set<string>>();
  for (const value of values) {
    const key = serviceKey(value.path) ?? "";
    if (CONTAINER_KEYS.has(key)) {
      const name = String(value.path[1]);
      keys.set(name, new Set([...(keys.get(name) ?? []), key]));
    }
  }
  return (name) => keys.get(name)?.size === CONTAINER_KEYS.size;
}

/**
 * The services of a Compose file and those whose container is not known: another file of its
 * folder sets their entrypoint or command (`outside`), or they get one from a service of another
 * file, or of none, through `extends`.
 */
export function composeServices(
  values: readonly DocumentValue[],
  outside: ReadonlySet<string>,
): ComposeServices {
  const extensions = serviceExtensions(values);
  const services = values.flatMap(({ path }) =>
    path[0] === SERVICES_KEY ? [String(path[1])] : [],
  );
  const context: UnknownContext = {
    extensions,
    outside,
    services: new Set(services),
    setsBoth: servicesSettingBoth(values),
  };
  const unknown = [...context.services].filter((name) => isUnknown(name, context, new Set()));
  return { extensions, unknown: new Set(unknown) };
}
