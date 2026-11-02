/** Stable, machine-readable error codes of the harness. */
export const HarnessErrorCode = {
  CatalogInvalid: "CATALOG_INVALID",
  DuplicateCorpusEntry: "DUPLICATE_CORPUS_ENTRY",
  StoredFileInvalid: "STORED_FILE_INVALID",
  SettingsInvalid: "SETTINGS_INVALID",
  UnknownOptionSet: "UNKNOWN_OPTION_SET",
} as const;

export type HarnessErrorCode = (typeof HarnessErrorCode)[keyof typeof HarnessErrorCode];

/** Base class for expected harness failures; `code` is stable, `message` is for humans. */
export class HarnessError extends Error {
  readonly code: HarnessErrorCode;

  constructor(code: HarnessErrorCode, message: string) {
    super(message);
    this.name = "HarnessError";
    this.code = code;
  }
}
