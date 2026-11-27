// Preloaded into each generator process with `node --require`: when the process exits, it writes
// its peak resident set size in bytes to the file named by BENCH_PEAK_RSS_FILE. The process
// measures itself, so the number means the same on every operating system (libuv reports KiB).
const { writeFileSync } = require("node:fs");

const BYTES_PER_KIB = 1024;
const target = process.env.BENCH_PEAK_RSS_FILE;

if (target) {
  process.on("exit", () => {
    writeFileSync(target, String(process.resourceUsage().maxRSS * BYTES_PER_KIB));
  });
}
