---
"openapi-typesafe-migrate": patch
---

Old flags that a workflow step gets from an input are listed as a manual step in more forms:
`${{ github.event.inputs.flags }}`, an `env` value `FL: ${{ inputs.flags }}` used as `$FL`, and a
literal in an expression (`${{ inputs.flags || '-it' }}`). The flags after a shell default around
an input (`${GEN:-${{ inputs.gen }}} e.yaml -it`) and after a shell default for a variable the
file does not set (`${GEN:-mytool}`) are listed too. Before, these were kept without a word.
