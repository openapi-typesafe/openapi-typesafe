// A stand-in for `tsc`: `-p pass.json` exits 0, `-p slow.json` never ends, anything else fails
// with a TypeScript-like error on stdout and a note on stderr.
const project = process.argv[process.argv.indexOf("-p") + 1];
if (project === "pass.json") {
  process.exit(0);
}
if (project === "slow.json") {
  setInterval(() => {}, 1_000);
} else {
  process.stdout.write(`${project}(1,1): error TS2322: broken\n`);
  process.stderr.write("stderr note\n");
  process.exit(2);
}
