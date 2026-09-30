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
defaults.json    curated default model lists, keyed by provider (order is the
                 display order)
schemas/         JSON schema for the compiled runtime artifact
scripts/         build & validate scripts (CI-side only; never shipped or
                 executed by the app)
```

Provider files are authoring units for review and mergeability. CI compiles
them into one complete runtime snapshot — the artifact is never a partial or
per-provider patch.

`defaults.json` is the curated default model list: for each provider it names
the models a client shows when the user has not configured their own list,
and the array order is the display order. A provider key that is absent means
this catalog carries no curated default for that provider, so the client falls
back to whatever its own provider declares; an empty array is an explicit "no
curated defaults for this provider" and stops that fallback. Defaults are
advisory curation, never entitlements: a listed model still requires whatever
account access its provider demands.

Defaults must stay consistent with the rest of the catalog. Every provider key
and every listed model id must exist in `providers/`, and a listed model must
not be an image-generation entry (`type: "image"`), because this list drives
the chat model picker. The JSON schema can only describe the shape; these
cross-reference rules are enforced by `scripts/validate-catalog.mjs`.

## Release artifacts

Each release publishes exactly one immutable asset:

```text
model-catalog.v1.json   the complete catalog snapshot
```

The file is a full, self-contained snapshot — never a per-provider patch —
and is never modified in place once published. The app consumes this
release asset only, over HTTPS. It never reads the mutable default branch,
never clones this repository, and never executes anything from it.

## Validation

CI must reject:

- duplicate provider/model identities;
- malformed or empty IDs;
- unknown runtime fields under the current schema;
- invalid numeric limits or capability values;
- credential material, authorization headers, cookies, API keys or secrets;
- provider base URLs, links, or any executable/network instructions;
- a default list whose provider key or model id is not in `providers/`, that
  repeats an entry, or that names an image-generation model;
- an artifact that differs from the canonical build output.

The "no URL/link fields" rule is load-bearing for the channel's trust model.
If the schema is ever widened to include any URL-like field, artifact signing
must be re-evaluated before that change ships.

## Building and validating locally

This repository has zero npm dependencies; everything below runs on a plain
Node.js >= 18 install.

```sh
node scripts/validate-catalog.mjs                       # validate providers/*.json + fallbacks.json + defaults.json
node scripts/build-catalog.mjs                           # compile dist/model-catalog.v1.json
node scripts/validate-catalog.mjs --artifact dist/model-catalog.v1.json
npm test                                                  # node:test suite
```

`build-catalog.mjs` validates the source tree before compiling and validates
the compiled artifact again before writing anything to `dist/`; either
validation failing leaves `dist/` untouched and exits non-zero.

`publishedAt` is stamped with the current UTC time at build. Pass
`--published-at <iso-8601-utc>` (e.g. `--published-at 2026-08-20T12:34:56Z`)
to pin it instead, for a reproducible build; an invalid or non-UTC value is
rejected.

## Syncing from the upstream runtime catalog

`scripts/sync-from-pi.mjs` reconciles this repository's whitelisted fields
(context, max output, image support, reasoning support) against the model
catalog bundled inside the `pi-ai` npm package, for `(provider, modelId)`
pairs that already exist here — it never introduces a new model or a new
field. It requires a local `pi-ai` package install; point it at that
package's model-catalog directory with `--pi-dist <path>`, which has no
default and is never guessed. It defaults to a dry-run summary; pass
`--write` to apply. Run `node scripts/sync-from-pi.mjs --help` for details.

## CI and release process

CI (`.github/workflows/ci.yml`) runs on every push and pull request and does
exactly two things: validate the source tree, then run the test suite. CI
does **not** publish anything — it is a gate, not a release pipeline.

Publishing a release is a separate, manual, owner-controlled step:

1. Update provider source files from the provider's current official model
   documentation. Record the supporting links and any scope limits in
   [MODEL-METADATA.md](MODEL-METADATA.md). Keep URLs out of runtime JSON.
2. Run `npm run validate` and `npm test`, then commit the reviewed source.
3. Choose a UTC `publishedAt` later than every previously distributed artifact,
   including bundled application baselines. Build with
   `node scripts/build-catalog.mjs --published-at <iso-8601-utc>`.
4. Validate the exact bytes with
   `node scripts/validate-catalog.mjs --artifact dist/model-catalog.v1.json`.
   Record the source commit, timestamp, and artifact SHA-256 in the release notes.
5. With explicit publication authorization, create a new tagged GitHub Release
   and upload that single compiled file as its asset, unmodified. Make the
   release the latest stable release so clients can discover it. Never replace
   an older release asset in place.
6. Download the published asset and verify its hash and timestamp match the
   reviewed build. An application refresh should report the same active catalog.

Editing source, pushing a commit, or passing CI does not update installed
clients. Until step 5, clients still download the previous release. A client
with a newer bundled or cached snapshot rejects an older downloaded timestamp
with `published-at-regression`; publish a newer snapshot instead of disabling
that protection.

New runtime fields must be readable by supported clients before publication.
The current artifact retains schema v1 and its existing field vocabulary;
explicit `xhigh` and `max` choices use `thinkingLevels`, with the legacy
`thinkingLevelMap.xhigh` mapping retained for older clients.

The top-level `defaults` block is a new runtime block, so it is published only
once clients that read it are the supported baseline (**new runtime blocks
need the client first**). Clients that predate it reject the whole artifact
rather than reading it partially — the refresh channel reports the artifact as
unavailable and the client silently keeps its current catalog, with no visible
error. The `defaults` publication in this batch is the last one that is
incompatible with an older client; the owner approved that single transition,
and after it a client-side baseline catalog carries the same block so an older
cached snapshot is never consulted alone again.

The application consumes only this one immutable release asset over HTTPS.
It never reads this repository's mutable default branch, never clones the
repository, and never executes anything from it.
