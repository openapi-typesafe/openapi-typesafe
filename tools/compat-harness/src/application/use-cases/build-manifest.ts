import { type CorpusManifest, carryOverHashes, createManifest } from "../../domain/manifest.ts";
import { parseCatalogJson, readApisGuruCatalog, readCuratedCatalog } from "../catalogs.ts";
import { decodeManifest, encodeJson } from "../codecs.ts";
import { REPOSITORY_PATHS } from "../layout.ts";
import type { FileStore, HttpClient, Logger } from "../ports.ts";
import { fetchJsonCatalog } from "./fetch-json-catalog.ts";

export interface BuildManifestDependencies {
  readonly http: HttpClient;
  readonly repository: FileStore;
  readonly logger: Logger;
}

/**
 * Rebuild `corpus/manifest.json` from the APIs.guru list and the curated list. Hashes from the
 * previous manifest are kept for entries whose source URL did not change, so a rebuild does not
 * force a re- download.
 */
export async function buildManifest(
  dependencies: BuildManifestDependencies,
  apisGuruListUrl: string,
): Promise<CorpusManifest> {
  const { http, repository, logger } = dependencies;
  const apisGuruEntries = readApisGuruCatalog(await fetchJsonCatalog(http, apisGuruListUrl));
  const curatedText = await repository.readText(REPOSITORY_PATHS.curatedCatalog);
  const curatedEntries = readCuratedCatalog(
    curatedText === undefined ? [] : parseCatalogJson(curatedText, REPOSITORY_PATHS.curatedCatalog),
  );

  const previousText = await repository.readText(REPOSITORY_PATHS.manifest);
  const previous = previousText === undefined ? undefined : decodeManifest(previousText);
  const manifest = carryOverHashes(
    createManifest([...apisGuruEntries, ...curatedEntries]),
    previous,
  );

  await repository.writeText(REPOSITORY_PATHS.manifest, encodeJson(manifest));
  logger.info("manifest_built", {
    entries: manifest.entries.length,
    apisGuruEntries: apisGuruEntries.length,
    curatedEntries: curatedEntries.length,
    hashesCarriedOver: manifest.entries.filter((entry) => entry.sha256 !== null).length,
  });
  return manifest;
}
