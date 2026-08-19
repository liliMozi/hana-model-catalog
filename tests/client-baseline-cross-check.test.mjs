// Cross-validates this repository's build output against a frozen copy of
// the application's own compiled bundled-baseline catalog
// (tests/fixtures/client-baseline-catalog.v1.json), captured at the
// migration point when this repository's data was split out of the
// application's own model dictionaries.
//
// The fixture is vendored (rather than fetched live via `git show` against
// the application repository) so this test is self-contained and portable:
// it must keep passing in this repository's own CI, on any machine, forever
// -- not only on the machine that performed the migration.
//
// publishedAt and catalogVersion are intentionally excluded from the
// comparison: the fixture is frozen at the application's packaged-baseline
// version (1), while this repository's catalog-version.json advances
// independently and must always publish a value strictly greater than 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../scripts/build-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = join(REPO_ROOT, "tests", "fixtures", "client-baseline-catalog.v1.json");

test("build output matches the frozen client baseline, ignoring publishedAt/catalogVersion", () => {
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const { catalog } = buildCatalog(REPO_ROOT);

  assert.strictEqual(catalog.schemaVersion, baseline.schemaVersion);
  assert.deepStrictEqual(catalog.providers, baseline.providers);
  assert.deepStrictEqual(catalog.fallbacks, baseline.fallbacks);

  assert.ok(typeof baseline.catalogVersion === "number" && typeof catalog.catalogVersion === "number");
  assert.ok(typeof baseline.publishedAt === "string" && typeof catalog.publishedAt === "string");
});

test("the frozen baseline fixture itself is a schema-valid catalog document", async () => {
  const { validateArtifact } = await import("../scripts/validate-catalog.mjs");
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const errors = validateArtifact(baseline);
  assert.deepStrictEqual(errors, []);
});
