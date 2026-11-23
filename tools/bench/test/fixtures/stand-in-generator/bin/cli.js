// A stand-in for a generator CLI (`cli <document> -o <file>`): a document named `broken.yaml`
// fails with a message, `slow.yaml` never ends, `abrupt.yaml` exits with code 0 but skips the
// "exit" event (so the memory probe writes nothing), `empty-memory.yaml`, `cut-memory.yaml` and
// `fraction-memory.yaml` overwrite the probe's file with a bad number after the probe wrote it,
// anything else writes a small output file.
import { writeFileSync } from "node:fs";
import { basename } from "node:path";

const [document] = process.argv.slice(2);
const output = process.argv[process.argv.indexOf("-o") + 1];
const name = basename(document);
if (name === "broken.yaml") {
  process.stderr.write("cannot read broken.yaml\n");
  process.exit(1);
}
if (name === "abrupt.yaml") {
  // reallyExit ends the process without emitting "exit", like a native crash with code 0.
  process.reallyExit(0);
}
const BAD_PROBE_TEXT = {
  "empty-memory.yaml": "",
  "cut-memory.yaml": "12a",
  "fraction-memory.yaml": "1.5",
};
if (name in BAD_PROBE_TEXT) {
  // Listeners run in order, so this one runs after the probe's and replaces what it wrote.
  process.on("exit", () => writeFileSync(process.env.BENCH_PEAK_RSS_FILE, BAD_PROBE_TEXT[name]));
}
if (name === "slow.yaml") {
  setInterval(() => {}, 1_000);
} else {
  writeFileSync(output, "export interface paths {}\n");
}
