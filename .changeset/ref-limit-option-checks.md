---
"openapi-typesafe": patch
---

The `$ref` limits are checked before anything loads:

- In the Node API, a `remoteRefHosts` that is no list of strings, or a `localRefRoot` that is no
  path or `file:` URL, fails with `OPTION_INVALID` and `details.option`. It failed later as an error
  of the document, such as `hosts.map is not a function`.
- `--local-ref-root https://…` fails with `CLI_FLAG_INVALID` (exit code `2`) instead of exit code
  `3`, and a `local-ref-root` URL of another protocol in `redocly.yaml` with `CLI_CONFIG_INVALID`.
- In the Node API, a `localRefRoot` string with a scheme is a URL, as for `--local-ref-root`:
  `"file:///specs/"` is that directory, not a path below `cwd`, and `"https://…"` fails with
  `OPTION_INVALID`.
