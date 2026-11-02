import { describe, expect, it } from "vitest";
import { CorpusSource, createCorpusEntryId } from "../../src/domain/corpus-entry.ts";

describe("createCorpusEntryId", () => {
  it("createCorpusEntryId with plain parts joins them with a double dash", () => {
    const id = createCorpusEntryId(CorpusSource.ApisGuru, "stripe.com", "2020-08-27");

    expect(id).toBe("apis-guru--stripe.com--2020-08-27");
  });

  it("createCorpusEntryId with unsafe characters replaces each run with an underscore", () => {
    const id = createCorpusEntryId(CorpusSource.Curated, "googleapis.com:admin/v1", "3.0 (next)");

    expect(id).toBe("curated--googleapis.com_admin_v1--3.0_next_");
  });
});
