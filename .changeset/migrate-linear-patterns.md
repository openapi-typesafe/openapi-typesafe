---
"openapi-typesafe-migrate": patch
---

A crafted component or `pnpm-workspace.yaml` no longer makes the tool run for seconds or minutes.
The search for `<script>` blocks and the patterns for catalog entries and override keys took time
quadratic in the input (6.8 s for a 640 kB `.vue` file, 15 s for a 160 kB line); they are linear
now.
