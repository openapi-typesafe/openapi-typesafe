import { describe, expect, it } from "vitest";
import { CorpusSource } from "../../src/domain/corpus-entry.ts";
import { selectCorpusSubset } from "../../src/domain/corpus-subset.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";

const curated = makeEntry({ name: "big", source: CorpusSource.Curated });
const listed = Array.from({ length: 10 }, (_, index) => makeEntry({ name: `api-${index}` }));
const notPreferred = makeEntry({ name: "api-old", isPreferred: false });

describe("selectCorpusSubset", () => {
  it("selectCorpusSubset keeps curated entries and spreads the rest evenly", () => {
    const subset = selectCorpusSubset([...listed, notPreferred, curated], 3);

    expect(subset.map((entry) => entry.name)).toEqual(["big", "api-0", "api-5"]);
  });

  it("selectCorpusSubset larger than the candidates returns every preferred entry", () => {
    const subset = selectCorpusSubset([...listed, notPreferred, curated], 100);

    expect(subset).toHaveLength(11);
    expect(subset).not.toContain(notPreferred);
  });

  it("selectCorpusSubset smaller than the curated list still keeps every curated entry", () => {
    expect(selectCorpusSubset([curated, ...listed], 0)).toEqual([curated]);
  });
});
