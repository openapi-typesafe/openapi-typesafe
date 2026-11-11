---
"openapi-typesafe-migrate": patch
---

A CI step whose `shell` is another program (`shell: python` in GitHub Actions, or a CircleCI
`shell` next to `command`) runs code of that language, not commands. Its script is now left as it
is and reported when it names an old package; it was skipped without a word.
