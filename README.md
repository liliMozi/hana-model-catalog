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
