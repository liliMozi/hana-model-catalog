# hana-model-catalog

Curated model-information catalog for Hana. This repository owns reference
data about provider/model pairs — display names, context/output limits,
modalities, reasoning capability, and wire-compatibility metadata.

It contains **data only**: no executable code the app would run, no provider
base URLs, no credential material.

## Layout

```text
providers/       per-provider authoring units (one JSON per provider)
fallbacks.json   generic per-model fallbacks (no provider-level contracts)
schemas/         JSON schema for the compiled runtime artifact
scripts/         build & validate scripts (CI-side only; never shipped or
                 executed by the app)
```

Provider files are authoring units for review and mergeability. CI compiles
them into one complete runtime snapshot — the artifact is never a partial or
per-provider patch.

## Release artifacts

Each release publishes exactly two immutable assets:

```text
model-catalog.v1.json            the complete catalog snapshot
model-catalog-manifest.v1.json   schemaVersion, strictly increasing
                                 catalogVersion, publishedAt, target SHA-256,
                                 byte size
```

The app consumes release assets only. It never reads the mutable default
branch, never clones this repository, and never executes anything from it.

## Validation

CI must reject:

- duplicate provider/model identities;
- malformed or empty IDs;
- unknown runtime fields under the current schema;
- invalid numeric limits or capability values;
- credential material, authorization headers, cookies, API keys or secrets;
- provider base URLs, links, or any executable/network instructions;
- a publication whose `catalogVersion` does not advance;
- an artifact that differs from the canonical build output.

The "no URL/link fields" rule is load-bearing for the channel's trust model.
If the schema is ever widened to include any URL-like field, artifact signing
must be re-evaluated before that change ships.

## Building and validating locally

This repository has zero npm dependencies; everything below runs on a plain
Node.js >= 18 install.

```sh
node scripts/validate-catalog.mjs                       # validate providers/*.json + fallbacks.json
node scripts/build-catalog.mjs                           # compile dist/model-catalog.v1.json + manifest
node scripts/validate-catalog.mjs --artifact dist/model-catalog.v1.json
npm test                                                  # node:test suite
```

`build-catalog.mjs` validates the source tree before compiling and validates
the compiled artifact again before writing anything to `dist/`; either
validation failing leaves `dist/` untouched and exits non-zero.

The compiled `catalogVersion` comes from `catalog-version.json` at the
repository root. Bump it by hand, by at least 1, before every release —
`catalogVersion` must strictly increase from whatever was last published;
publishing a value that does not advance is a protocol violation the
application's update client treats as a rollback attempt and rejects.

## CI and release process

CI (`.github/workflows/ci.yml`) runs on every push and pull request and does
exactly two things: validate the source tree, then run the test suite. CI
does **not** publish anything — it is a gate, not a release pipeline.

Publishing a release is a separate, manual, owner-controlled step:

1. Bump `catalogVersion` in `catalog-version.json`.
2. Run `node scripts/build-catalog.mjs` locally to produce
   `dist/model-catalog.v1.json` and `dist/model-catalog-manifest.v1.json`.
3. Create a GitHub Release and upload exactly those two files as its assets,
   unmodified.

The application consumes only these two immutable release assets over HTTPS.
It never reads this repository's mutable default branch, never clones the
repository, and never executes anything from it.
