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
//
// The fixture is a v1 artifact (pre-`defaults`, pre-capability-gating), so the
// comparison target is this repository's **v1 projection**, not the v2 primary
// artifact: v1 is what a client of that vintage receives today. Entries that
// declare `requiresCapabilities` are deliberately absent from the projection, so
// a gated model must never be added to this fixture -- that would pin an entry
// the v1 channel is designed not to deliver.
// What must hold forever is narrower: every field that already existed on a
// baseline entry must still build to the exact same value today, unless an
// exact source-backed correction is listed below. The first test below walks
// every provider/model key present in the fixture and, field by field, asserts
// the corresponding field in today's build output is unchanged unless that
// correction applies; a removed entry, a removed field, or an unreviewed
// changed value on an existing field still fails the test, but an additive
// field on an entry the baseline already covers does not. Keys added after the
// migration point (not present in the fixture) are outside its scope and are
// not compared.
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

// Kimi Coding K3 corrections, reviewed October 25, 2026 against the official
// Kimi Code model configuration:
// https://www.kimi.com/code/docs/kimi-code/models.html
// The frozen fixture bytes stay unchanged; only these exact source-backed
// corrections are allowed, and each must still match its original value.
const KIMI_K3_BASELINE_CORRECTIONS = new Map([
  ["providers.kimi-coding.k3.thinkingLevels", {
    from: ["medium", "high", "max"],
    to: ["low", "high", "max"],
  }],
  ["providers.kimi-coding.k3.thinkingLevelMap", {
    from: { off: null, low: "low", medium: "low", high: "high", xhigh: "max" },
    to: { off: null, low: "low", medium: "high", high: "high", xhigh: "max" },
  }],
  ["providers.kimi-coding.k3.defaultThinkingLevel", { from: "max", to: "high" }],
  ["providers.kimi-coding.k3-256k.thinkingLevels", {
    from: ["medium", "high", "max"],
    to: ["low", "high", "max"],
  }],
  ["providers.kimi-coding.k3-256k.thinkingLevelMap", {
    from: { off: null, low: "low", medium: "low", high: "high", xhigh: "max" },
    to: { off: null, low: "low", medium: "high", high: "high", xhigh: "max" },
  }],
]);

function expectedBaselineValue(path, oldValue) {
  const correction = KIMI_K3_BASELINE_CORRECTIONS.get(path);
  if (!correction) return oldValue;
  assert.deepStrictEqual(oldValue, correction.from, `${path} correction must match its original baseline`);
  return correction.to;
}

test("build output preserves every entry of the frozen client baseline, ignoring publishedAt", () => {
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  // The fixture is a v1 artifact, so it is compared against the v1 projection —
  // the file a client of that vintage would actually receive today. A gated
  // entry may not be added to this fixture: it is removed from v1 by
  // construction, so pinning one here would assert that gating silently keeps
  // an entry the client cannot handle.
  const { v1Catalog: catalog } = buildCatalog(REPO_ROOT);

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
          expectedBaselineValue(`providers.${group}.${model}.${field}`, baselineValue),
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
        expectedBaselineValue(`fallbacks.${model}.${field}`, baselineValue),
        `fallbacks.${model}.${field} no longer matches the frozen baseline`,
      );
    }
  }

  assert.ok(typeof baseline.publishedAt === "string" && typeof catalog.publishedAt === "string");
});

test("the frozen baseline fixture itself is a schema-valid catalog document", async () => {
  const { validateArtifact } = await import("../scripts/validate-catalog.mjs");
  const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  // The fixture is a pre-defaults artifact: it was captured before the
  // canonical envelope gained the required top-level `defaults` block, so the
  // only shape deviation it may still carry is that one missing key. Its
  // schemaVersion, publishedAt, and every provider/fallback entry must stay
  // fully valid, and validateArtifact runs the complete data validation over
  // them. The baseline fixture bytes and the field-level checks above are the
  // load-bearing invariant and are not adjusted for the envelope change.
  const errors = validateArtifact(baseline);
  assert.deepStrictEqual(errors, ["model catalog is missing required top-level key: defaults"]);
});
