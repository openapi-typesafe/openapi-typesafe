import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  // A command only: bin/migrate.js imports the built CLI; there is no library API.
  entries: ["./src/cli/main.ts"],
  declaration: false,
  clean: true,
  sourcemap: true,
});
