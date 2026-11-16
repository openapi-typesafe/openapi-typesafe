import type { Finding, Locate } from "./argument-findings.js";
import type { DocumentString } from "./config-documents.js";
import type { ManualStep, WordRename } from "./migration-findings.js";

/**
 * A YAML anchor gives the same text to every map that uses it, through an alias (`command:
 * *args`) or a merge key (`<<: *args`), so one place of the file can be the command of several
 * containers. Each container reads it with its own entrypoint; an edit there changes it for all
 * of them. So a place is edited only when every container that runs it reads it the same way;
 * otherwise its renames are one manual step. The anchor's own map counts as one of them when it
 * is a whole container (it pairs an entrypoint with a command); a map that holds only one part
 * (`x-args: &args { command: […] }`) is a part that the maps using it complete.
 */

/** What one container found, and the strings of its entrypoint and command it found it in. */
export interface PlaceReading {
  readonly findings: readonly Finding[];
  readonly places: readonly DocumentString[];
  /** Whether the container pairs an entrypoint with a command. */
  readonly isPaired: boolean;
}

/** The readings of one place, and the finding each gives there. */
interface PlaceReaders {
  readonly place: DocumentString;
  readonly readings: PlaceReading[];
}

const findingsAt = (reading: PlaceReading, place: DocumentString): Finding[] =>
  reading.findings.filter(({ offset }) => offset >= place.start && offset < place.end);

/** The places that more than one container reads, each with its readings. */
function sharedPlaces(readings: readonly PlaceReading[]): PlaceReaders[] {
  const byStart = new Map<number, PlaceReaders>();
  for (const reading of readings) {
    for (const place of reading.places) {
      const found = byStart.get(place.start) ?? { place, readings: [] };
      found.readings.push(reading);
      byStart.set(place.start, found);
    }
  }
  return [...byStart.values()].filter(({ readings: found }) => found.length > 1);
}

/** What a reading finds at a place, as one key that two equal readings share. */
const readingKey = (findings: readonly Finding[]): string =>
  JSON.stringify(
    findings
      .map(({ edit, change, manualStep }) => JSON.stringify({ edit, change, manualStep }))
      .sort(),
  );

/** What the readings of the shared places give: findings to drop, and steps to add. */
interface SharedOutcome {
  readonly dropped: Set<Finding>;
  readonly steps: Finding[];
}

/** The renames that the edits of some readings make at a place, each once. */
export function renamesOf(findings: readonly Finding[], text: string): WordRename[] {
  const renames = findings.flatMap(({ edit }) =>
    edit === undefined ? [] : [{ from: text.slice(edit.start, edit.end), to: edit.text }],
  );
  return [...new Map(renames.map((rename) => [JSON.stringify(rename), rename])).values()];
}

/**
 * One shared place: a part that the anchor's own map holds alone is read in the maps that use
 * it; where the others differ, their edits there become one step.
 */
function readShared({ place, readings }: PlaceReaders, context: SharedContext): void {
  const isPart = (reading: PlaceReading): boolean =>
    !reading.isPaired && context.written.has(reading.places.find((at) => at === place));
  const parts = readings.filter(isPart);
  const counted = readings.filter((reading) => !isPart(reading));
  for (const finding of parts.flatMap((reading) => findingsAt(reading, place))) {
    context.outcome.dropped.add(finding);
  }
  const found = counted.map((reading) => findingsAt(reading, place));
  if (new Set(found.map(readingKey)).size <= 1) {
    return;
  }
  const edits = found.flat().filter(({ edit }) => edit !== undefined);
  for (const finding of edits) {
    context.outcome.dropped.add(finding);
  }
  const renames = renamesOf(edits, context.text);
  if (renames.length > 0) {
    const location = context.locate(place.start);
    const manualStep: ManualStep = { kind: "shared-container-text", location, renames };
    context.outcome.steps.push({ offset: place.start, manualStep });
  }
}

/** What reading the shared places needs: the text, its places, and the outcome so far. */
interface SharedContext {
  readonly text: string;
  readonly locate: Locate;
  /** The strings where they are written, not where an alias or a merge key gives them again. */
  readonly written: ReadonlySet<DocumentString | undefined>;
  readonly outcome: SharedOutcome;
}

/**
 * The findings of the containers, where a place that several of them read is edited only when
 * they all read it the same way. `written` holds each string where it is written.
 */
export function sharedPlaceFindings(
  readings: readonly PlaceReading[],
  context: Omit<SharedContext, "outcome">,
): Finding[] {
  const outcome: SharedOutcome = { dropped: new Set(), steps: [] };
  for (const shared of sharedPlaces(readings)) {
    readShared(shared, { ...context, outcome });
  }
  const kept = readings.flatMap(({ findings }) =>
    findings.filter((finding) => !outcome.dropped.has(finding)),
  );
  return [...kept, ...outcome.steps];
}
