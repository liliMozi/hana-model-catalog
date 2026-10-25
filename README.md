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
schemas/         JSON schema for each compiled runtime artifact generation
                 (v1 and v2)
scripts/         build & validate scripts (CI-side only; never shipped or
                 executed by the app)
```

Provider files are authoring units for review and mergeability. CI compiles
them into complete runtime snapshots — each artifact is a full snapshot, never a
partial or per-provider patch.

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

Each release publishes exactly two immutable assets, built from one reviewed
source tree in one command:

```text
model-catalog.v2.json   the complete catalog snapshot (schemaVersion 2)
model-catalog.v1.json   the gated-entry-free downgrade (schemaVersion 1)
```

Both are full, self-contained snapshots — never a per-provider patch — and
neither is ever modified in place once published. Both carry the **same**
`publishedAt`: they are two views of the same review, so a client must never
observe them at different ages. Record both hashes in the release notes (see
*CI and release process*).

The app consumes these release assets only, over HTTPS. It never reads the
mutable default branch, never clones this repository, and never executes
anything from it.

### Why two assets and not one

`model-catalog.v2.json` adds one field, `requiresCapabilities`, and the v1
schema's field whitelist is closed. A client built before v2 rejects an artifact
carrying an unknown field **as a whole** and silently keeps its cached catalog,
so publishing the new field inside a v1 artifact would stop the update channel
for every installed client. Stripping the requirement from the entry instead
would be worse: the old client would keep the entry and send a request shape it
does not implement.

The v1 artifact resolves both problems by being a **deterministic projection** of
the v2 data, never a second curation:

1. every provider entry that declares `requiresCapabilities` is removed whole;
2. every provider partition keeps its key even if that empties it;
3. every such model id is filtered out of `defaults`, with the provider key and
the remaining order kept (an empty array is the explicit "no curated defaults"
   marker; dropping the key would restore the client's own default list);
4. every fallback that declares `requiresCapabilities` is removed, which —
   together with the alias rule below — removes the copies an alias lookup could
   still resolve to;
5. no other entry is touched: no field is rewritten, downgraded or compensated.

A gated entry therefore does not exist in v1 at all, rather than existing with
its requirement stripped. With no gated entry in the source tree, the v1 artifact
is byte-identical to what the pre-v2 build produced — that identity is pinned by
a golden fixture in `tests/fixtures/zero-gate/`.

### Capability requirements

`requiresCapabilities` is an optional, non-empty array of 1–64 capability ids.
It is a **compatibility requirement, not a wire parameter**, which is why it is
allowed on both provider entries and fallbacks while `api`, `compat`,
`thinkingLevels` and the rest stay provider-only.

- Each id is 1–64 characters, already trimmed, free of control characters, not
  URL-shaped, and unique within its array.
- **The value set is open.** An unknown id is valid data: the capability
  vocabulary belongs to the client, and this repository must never fail because
  a future client named a capability it has not seen. Shape is enforced; meaning
  is not.
- Any `compat.thinkingFormat` / `compat.reasoningProfile` value outside the
  frozen v1 vocabulary **must** carry a requirement, because a v1 reader drops an
  unknown compat value silently and then sends a different request shape.
- A fallback that aliases a gated provider entry — including through a `-free`
  or `:route` suffix, a vendor namespace, or a dotted Claude version — must
  declare at least the same requirement. Otherwise it is a bypass and the source
  tree is rejected.

Which artifact a client reads, and what it does with an entry whose capabilities
it lacks, is the client's decision: such an entry must be treated as absent, not
read field-by-field.

## Validation

CI must reject:

- duplicate provider/model identities;
- malformed or empty IDs;
- unknown runtime fields under the current schema generation;
- invalid numeric limits or capability values;
- a malformed `requiresCapabilities` declaration (non-array, empty, more than 64
  ids, a non-string, an untrimmed or empty id, a control character, a URL, a
  duplicate, an id longer than 64 characters) — but never an unknown id value;
- a `compat` value outside the frozen v1 vocabulary without a corresponding
  capability requirement;
- a fallback that aliases a gated provider entry without declaring at least the
  same requirement;
- credential material, authorization headers, cookies, API keys or secrets;
- provider base URLs, links, or any executable/network instructions;
- a default list whose provider key or model id is not in `providers/`, that
  repeats an entry, or that names an image-generation model;
- a v1 artifact that carries `requiresCapabilities` anywhere;
- an artifact that differs from the canonical build output.

The "no URL/link fields" rule is load-bearing for the channel's trust model.
If the schema is ever widened to include any URL-like field, artifact signing
must be re-evaluated before that change ships.

## Building and validating locally

This repository has zero npm dependencies; everything below runs on a plain
Node.js >= 18 install.

```sh
node scripts/validate-catalog.mjs                       # validate providers/*.json + fallbacks.json + defaults.json (v2 rules)
node scripts/build-catalog.mjs                           # compile dist/model-catalog.v2.json + dist/model-catalog.v1.json
node scripts/validate-catalog.mjs --artifact dist/model-catalog.v2.json --expect-version 2
node scripts/validate-catalog.mjs --artifact dist/model-catalog.v1.json --expect-version 1
npm test                                                  # node:test suite
```

`build-catalog.mjs` validates the source tree before compiling, then validates
BOTH compiled artifacts before writing anything to disk — a failure at any stage
leaves `dist/` untouched and exits non-zero. `--target v1|v2|both` (default
`both`) selects which files are written; both are rebuilt and validated in
memory, but an unselected file on disk is left unchanged. Use `--target both`
for releases and check that both files have the same `publishedAt` before
uploading. A single-target build is for local inspection, not publication.

`validate-catalog.mjs --artifact` accepts several paths in one run and derives
the rule set from each document's own `schemaVersion`; `--expect-version` pins
the expected generation so a swapped or mislabelled file fails loudly.

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

CI (`.github/workflows/ci.yml`) runs on every push and pull request. It validates
the source tree, runs the tests, builds and validates both artifacts, and checks
that the v1 artifact contains no capability requirements. CI does **not** publish
anything — it is a gate, not a release pipeline.

Publishing a release is a separate, manual, owner-controlled step:

1. Update provider source files from the provider's current official model
   documentation. Record the supporting links and any scope limits in
   [MODEL-METADATA.md](MODEL-METADATA.md). Keep URLs out of runtime JSON.
2. Run `npm run validate` and `npm test`, then commit the reviewed source.
3. Choose a UTC `publishedAt` later than every previously distributed artifact,
   including bundled application baselines. Build with
   `node scripts/build-catalog.mjs --published-at <iso-8601-utc>`. Both artifacts
   are stamped with that one value.
4. Validate the exact bytes of both files:
   `node scripts/validate-catalog.mjs --artifact dist/model-catalog.v2.json --artifact dist/model-catalog.v1.json`.
   Record the source commit, timestamp, and **both** SHA-256 hashes in the release
   notes.
5. With explicit publication authorization, create a new tagged GitHub Release
   and upload both compiled files as its assets, unmodified. Make the release the
   latest stable release so clients can discover it. Never replace an older
   release asset in place.
6. Download the published assets and verify both hashes and the shared timestamp
   match the reviewed build. An application refresh should report the same active
   catalog.

Editing source, pushing a commit, or passing CI does not update installed
clients. Until step 5, clients still download the previous release. A client
with a newer bundled or cached snapshot rejects an older downloaded timestamp
with `published-at-regression`; publish a newer snapshot instead of disabling
that protection.

New runtime fields must be readable by clients of their schema generation.
Explicit `xhigh` and `max` choices use `thinkingLevels`, with the legacy
`thinkingLevelMap.xhigh` mapping retained for older clients.

The `defaults` block and the v2 `requiresCapabilities` field are the two
transitions that changed this rule's shape:

- `defaults` was a new top-level block, published only once clients that read it
  were the supported baseline (**new runtime blocks need the client first**).
  Clients that predate it reject the whole artifact rather than reading it
  partially — the refresh channel reports the artifact as unavailable and the
  client silently keeps its current catalog, with no visible error. The owner
  approved that single transition, and after it a client-side baseline catalog
  carries the same block so an older cached snapshot is never consulted alone
  again.
- `requiresCapabilities` is a new *field* in a new schema generation. Rather than
  force the same all-or-nothing transition again, it is published alongside a
  separate v1 artifact that omits both the field and every entry that needs it.
  Old clients keep updating from v1; new clients read v2 and skip entries whose
  capabilities they lack. This is the intended pattern for the next field: a new
  schema generation plus a v1 projection, never a field added to v1.

When retiring the v1 artifact (once every supported client reads v2), that is
its own reviewed decision: the two-asset scheme is what makes the retirement
safe, so it should not be reversed by an unrelated change.

The application consumes these immutable release assets over HTTPS.
It never reads this repository's mutable default branch, never clones the
repository, and never executes anything from it.
