// Verifies the split -> rebuild invariant: build-catalog.mjs must reconstruct
// providers/fallbacks that are exactly (deep-equal) the checked-in
// providers/*.json + fallbacks.json source tree, with no field dropped,
// coerced or reordered in a way that changes its meaning.
//
// This is the permanent, portable form of that check. The one-time
// provenance claim -- that providers/*.json + fallbacks.json themselves are
// a lossless split of the original pre-migration dictionaries -- was
// verified once, out of band, at migration time (see the repository's
// commit history); it is not re-verified here because doing so would
// require live access to the application repository that this test suite
// (and any CI running it) is not guaranteed to have.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog } from "../scripts/validate-catalog.mjs";
import { buildCatalog } from "../scripts/build-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("build output reconstructs the source tree losslessly", () => {
  const { providers, fallbacks, defaults, loadErrors } = loadSourceCatalog(REPO_ROOT);
  assert.deepStrictEqual(loadErrors, [], "source tree must load without errors");

  const { catalog } = buildCatalog(REPO_ROOT, { now: () => new Date("2026-01-01T00:00:00.000Z") });

  assert.deepStrictEqual(catalog.providers, providers, "compiled providers must deep-equal the source providers/*.json files");
  assert.deepStrictEqual(catalog.fallbacks, fallbacks, "compiled fallbacks must deep-equal the source fallbacks.json file");
  assert.deepStrictEqual(catalog.defaults, defaults, "compiled defaults must deep-equal the source defaults.json file");
});

test("the compiled v2 artifact carries defaults in the canonical key order", () => {
  const { catalog } = buildCatalog(REPO_ROOT, { now: () => new Date("2026-01-01T00:00:00.000Z") });
  assert.deepStrictEqual(
    Object.keys(catalog),
    ["schemaVersion", "publishedAt", "providers", "fallbacks", "defaults"],
  );
  assert.strictEqual(catalog.schemaVersion, 2);
});

test("the v2 artifact is a lossless superset and the v1 artifact its pure projection", () => {
  const { providers, fallbacks, defaults } = loadSourceCatalog(REPO_ROOT);
  const { catalog, v1Catalog } = buildCatalog(REPO_ROOT, { now: () => new Date("2026-01-01T00:00:00.000Z") });

  // v2 keeps the source tree whole.
  assert.deepStrictEqual(catalog.providers, providers);
  assert.deepStrictEqual(catalog.fallbacks, fallbacks);
  assert.deepStrictEqual(catalog.defaults, defaults);

  // v1 is the projection, not a re-curation: every kept entry is byte-identical
  // to its v2 twin, and the only difference is whole-entry removal.
  assert.strictEqual(v1Catalog.schemaVersion, 1);
  assert.strictEqual(v1Catalog.publishedAt, catalog.publishedAt);
  for (const [provider, models] of Object.entries(v1Catalog.providers)) {
    assert.ok(catalog.providers[provider], `v1 provider ${provider} must exist in v2`);
    for (const [modelId, entry] of Object.entries(models)) {
      assert.deepStrictEqual(entry, catalog.providers[provider][modelId],
        `v1 providers.${provider}.${modelId} must equal its v2 entry`);
    }
  }
  for (const [modelId, entry] of Object.entries(v1Catalog.fallbacks)) {
    assert.deepStrictEqual(entry, catalog.fallbacks[modelId],
      `v1 fallbacks.${modelId} must equal its v2 entry`);
  }
  for (const [provider, list] of Object.entries(v1Catalog.defaults)) {
    assert.deepStrictEqual(list, catalog.defaults[provider].filter((id) => id in (v1Catalog.providers[provider] || {})),
      `v1 defaults.${provider} must be the v2 list minus gated ids, in order`);
  }
});

test("a fixture with no gated and no unknown-wire entries projects to a v1 identical to the pre-gating build", () => {
  // The gate must be a no-op when nothing is gated. tests/fixtures/zero-gate/ is a
  // small source tree with no requiresCapabilities and no wire value outside the
  // frozen v1 vocabulary; expected.v1.json was produced by the pre-v2 build
  // script from that same tree. If the
  // projection ever rewrites a field instead of removing whole entries, or if the
  // envelope changes, these bytes diverge.
  const fixtureDir = join(REPO_ROOT, "tests", "fixtures", "zero-gate");
  const { catalog, v1Catalog, v1CatalogText } = buildCatalog(fixtureDir, {
    publishedAt: "2026-10-25T00:00:00Z",
  });

  // Nothing was gated, so the projection removed nothing and rewrote nothing.
  assert.deepStrictEqual(v1Catalog.providers, catalog.providers);
  assert.deepStrictEqual(v1Catalog.fallbacks, catalog.fallbacks);
  assert.deepStrictEqual(v1Catalog.defaults, catalog.defaults);

  // Byte-for-byte equal to the pre-v2 build of the same tree.
  assert.strictEqual(v1CatalogText, readFileSync(join(fixtureDir, "expected.v1.json"), "utf8"),
    "with no gated entries the v1 artifact must be the byte-identical pre-v2 artifact");
});

test("build output is deterministic given the same clock", () => {
  const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");
  const first = buildCatalog(REPO_ROOT, { now: fixedNow });
  const second = buildCatalog(REPO_ROOT, { now: fixedNow });
  assert.deepStrictEqual(first.catalog, second.catalog);
  assert.strictEqual(first.catalogText, second.catalogText);
});

test("build output has no catalogVersion field and a valid publishedAt", () => {
  const { catalog } = buildCatalog(REPO_ROOT, { now: () => new Date("2026-01-01T00:00:00.000Z") });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(catalog, "catalogVersion"), false);
  assert.ok(typeof catalog.publishedAt === "string" && !Number.isNaN(Date.parse(catalog.publishedAt)));
});

test("--published-at overrides the timestamp when valid, and rejects non-ISO-8601-UTC values", () => {
  const { catalog } = buildCatalog(REPO_ROOT, { publishedAt: "2026-03-05T14:30:00Z" });
  assert.strictEqual(catalog.publishedAt, "2026-03-05T14:30:00Z");

  assert.throws(() => buildCatalog(REPO_ROOT, { publishedAt: "not-a-timestamp" }), /ISO 8601 UTC/);
  assert.throws(() => buildCatalog(REPO_ROOT, { publishedAt: "2026-03-05" }), /ISO 8601 UTC/);
  assert.throws(() => buildCatalog(REPO_ROOT, { publishedAt: "2026-03-05T14:30:00+08:00" }), /ISO 8601 UTC/);
});
