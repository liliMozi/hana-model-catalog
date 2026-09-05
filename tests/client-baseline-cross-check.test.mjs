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
// The catalog legitimately grows after the migration point -- new providers
// and models get added over time, and existing entries may gain new fields
// -- so the build output is not expected to equal the fixture wholesale.
// What must hold forever is narrower: every field that already existed on a
// baseline entry must still build to the exact same value today. The first
// test below walks every provider/model key present in the fixture and,
// field by field, asserts the corresponding field in today's build output
// is unchanged; a removed entry, a removed field, or a changed value on an
// existing field still fails the test, but an additive field on an entry
// the baseline already covers does not. Keys added after the migration
// point (not present in the fixture) are outside its scope and are not
// compared.
//
// publishedAt is intentionally excluded from the comparison: the fixture is
// frozen at its capture time, while every build of this repository stamps
// publishedAt with the current build time (or an explicit --published-at
// override).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../scripts/build-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = join(REPO_ROOT, "tests", "fixtures", "client-baseline-catalog.v1.json");

test("build output preserves every entry of the frozen client baseline, ignoring publishedAt", () => {
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const { catalog } = buildCatalog(REPO_ROOT);

  assert.strictEqual(catalog.schemaVersion, baseline.schemaVersion);

  for (const [group, baselineGroup] of Object.entries(baseline.providers)) {
    assert.ok(catalog.providers[group], `providers.${group} was removed from the build output`);
    for (const [model, baselineEntry] of Object.entries(baselineGroup)) {
      const catalogEntry = catalog.providers[group][model];
      assert.ok(catalogEntry, `providers.${group}.${model} was removed from the build output`);
      for (const [field, baselineValue] of Object.entries(baselineEntry)) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(catalogEntry, field),
          `providers.${group}.${model}.${field} was removed from the build output`,
        );
        assert.deepStrictEqual(
          catalogEntry[field],
          baselineValue,
          `providers.${group}.${model}.${field} no longer matches the frozen baseline`,
        );
      }
    }
  }

  for (const [model, baselineEntry] of Object.entries(baseline.fallbacks)) {
    const catalogEntry = catalog.fallbacks[model];
    assert.ok(catalogEntry, `fallbacks.${model} was removed from the build output`);
    for (const [field, baselineValue] of Object.entries(baselineEntry)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(catalogEntry, field),
        `fallbacks.${model}.${field} was removed from the build output`,
      );
      assert.deepStrictEqual(
        catalogEntry[field],
        baselineValue,
        `fallbacks.${model}.${field} no longer matches the frozen baseline`,
      );
    }
  }

  assert.ok(typeof baseline.publishedAt === "string" && typeof catalog.publishedAt === "string");
});

test("the frozen baseline fixture itself is a schema-valid catalog document", async () => {
  const { validateArtifact } = await import("../scripts/validate-catalog.mjs");
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const errors = validateArtifact(baseline);
  assert.deepStrictEqual(errors, []);
});
