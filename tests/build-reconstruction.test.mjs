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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog } from "../scripts/validate-catalog.mjs";
import { buildCatalog } from "../scripts/build-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("build output reconstructs the source tree losslessly", () => {
  const { providers, fallbacks, loadErrors } = loadSourceCatalog(REPO_ROOT);
  assert.deepStrictEqual(loadErrors, [], "source tree must load without errors");

  const { catalog } = buildCatalog(REPO_ROOT, { now: () => new Date("2026-01-01T00:00:00.000Z") });

  assert.deepStrictEqual(catalog.providers, providers, "compiled providers must deep-equal the source providers/*.json files");
  assert.deepStrictEqual(catalog.fallbacks, fallbacks, "compiled fallbacks must deep-equal the source fallbacks.json file");
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
