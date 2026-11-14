---
"openapi-typesafe-migrate": patch
---

The migration reads the parameters of more CI files as it reads GitHub Actions inputs: CircleCI
`parameters` with `<< parameters.gen >>`, GitLab `spec: inputs` with `$[[ inputs.gen ]]`, and Azure
Pipelines template `parameters` with `${{ parameters.gen }}`. A parameter's default is renamed, and
the old flags after or inside such a reference are reported. Each file kind reads only its own
parameters, and `${{ inputs['flags'] }}` is read like `${{ inputs.flags }}`. Before, the flags
after these references were kept without a word, and a GitLab input default was renamed while the
flags after `$[[ inputs.gen ]]` were not.
