---
"openapi-typesafe-migrate": patch
---

The generator bin given by a Windows path without a suffix (`node_modules\.bin\openapi-typescript`,
which cmd.exe runs as the `.cmd` file) is renamed to `node_modules\.bin\openapi-typesafe`, and the
old flags after it are renamed. Before, the script was kept as it was and not reported, so it
called a bin that the migration had removed.
