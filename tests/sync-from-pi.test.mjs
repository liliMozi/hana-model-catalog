// Fixture-based tests for scripts/sync-from-pi.mjs: field mapping, the
// exclusion table (both its native provider-scoped keys and the derived
// fallback-scoped keys), the write path's own validate-catalog check,
// idempotency of --write, ambiguous fallback resolution, and --pi-dist
// argument/path validation.
//
// All fixtures are throwaway temp directories (mkdtempSync), matching the
// pattern already used in tests/validate-catalog.test.mjs for
// loadSourceCatalog. No fixture files are committed to the repository.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSource } from "../scripts/validate-catalog.mjs";
import {
  resolvePiDist,
  loadPiModels,
  computeSyncPlan,
  formatReport,
  runSync,
} from "../scripts/sync-from-pi.mjs";

function writeJson(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

// A minimal but representative source tree: one plain provider with a model
// whose fields all disagree with upstream, plus "anthropic"/"claude-opus-4-6"
// specifically because "anthropic/claude-opus-4-6.context" is one of the
// real, ported EXCLUDED_UPDATES keys — exercising the real exclusion table,
// not a synthetic stand-in for it. Both models are mirrored into
// fallbacks.json, matching how this repository's real fallbacks.json mirrors
// provider entries under the same model id.
function makeRepoFixture() {
  const dir = mkdtempSync(join(tmpdir(), "hana-model-catalog-sync-repo-"));
  mkdirSync(join(dir, "providers"));
  writeJson(join(dir, "providers", "testprovider.json"), {
    "model-a": { name: "Test Model", context: 100000, maxOutput: 4096, image: false, reasoning: false },
  });
  writeJson(join(dir, "providers", "anthropic.json"), {
    "claude-opus-4-6": { name: "Claude Opus 4.6", context: 200000, maxOutput: 128000, image: true, reasoning: true },
  });
  writeJson(join(dir, "fallbacks.json"), {
    "model-a": { name: "Test Model", context: 100000, maxOutput: 4096, image: false, reasoning: false },
    "claude-opus-4-6": { name: "Claude Opus 4.6", context: 200000, maxOutput: 128000, image: true, reasoning: true },
  });
  return dir;
}

// A pi-ai-shaped package fragment: a package.json declaring "type": "module"
// (required for Node to parse the generated file's `export const` syntax as
// ESM when it's loaded via dynamic import()) plus the one file this tool
// knows how to read.
function makePiDistFixture(extraProviders = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hana-model-catalog-sync-pi-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pi-ai-fixture", type: "module" }), "utf8");
  const MODELS = {
    testprovider: {
      "model-a": { contextWindow: 200000, maxTokens: 8192, input: ["text", "image"], reasoning: true },
    },
    anthropic: {
      "claude-opus-4-6": { contextWindow: 1000000, maxTokens: 128000, input: ["text", "image"], reasoning: true },
    },
    ...extraProviders,
  };
  writeFileSync(join(dir, "models.generated.js"), `export const MODELS = ${JSON.stringify(MODELS)};\n`, "utf8");
  return dir;
}

function cleanup(...dirs) {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 1. Field mapping: a differing field shows up in the plan and in the
//    dry-run report, in both the provider-scoped and fallback-scoped pass.
// ---------------------------------------------------------------------------

test("computeSyncPlan: surfaces field differences for a matched model in both providers and fallbacks scope", async () => {
  const repo = makeRepoFixture();
  const pi = makePiDistFixture();
  try {
    const MODELS = await loadPiModels(pi);
    const plan = computeSyncPlan(repo, MODELS);

    const providerDiffKeys = plan.providerDiffs.map((d) => `${d.provider}/${d.modelId}.${d.field}`);
    for (const key of [
      "testprovider/model-a.context",
      "testprovider/model-a.maxOutput",
      "testprovider/model-a.image",
      "testprovider/model-a.reasoning",
    ]) {
      assert.ok(providerDiffKeys.includes(key), `expected provider diff: ${key}`);
    }

    const fallbackDiffKeys = plan.fallbackDiffs.map((d) => `${d.modelId}.${d.field}`);
    for (const key of ["model-a.context", "model-a.maxOutput", "model-a.image", "model-a.reasoning"]) {
      assert.ok(fallbackDiffKeys.includes(key), `expected fallback diff: ${key}`);
    }

    const report = formatReport(plan, { write: false });
    assert.match(report, /testprovider\/model-a\.context: 100000 -> 200000/);
    assert.match(report, /^model-a\.context: 100000 -> 200000/m);
  } finally {
    cleanup(repo, pi);
  }
});

// ---------------------------------------------------------------------------
// 2. Exclusion table: a real ported EXCLUDED_UPDATES key is kept, not
//    applied — in the provider-scoped pass directly, and in the
//    fallback-scoped pass via the derived bare key.
// ---------------------------------------------------------------------------

test("computeSyncPlan: an excluded (provider, modelId, field) is kept, not applied, in both scopes", async () => {
  const repo = makeRepoFixture();
  const pi = makePiDistFixture();
  try {
    const MODELS = await loadPiModels(pi);
    const plan = computeSyncPlan(repo, MODELS);

    const providerDiffKeys = plan.providerDiffs.map((d) => `${d.provider}/${d.modelId}.${d.field}`);
    assert.ok(!providerDiffKeys.includes("anthropic/claude-opus-4-6.context"));
    assert.ok(
      plan.providerExcluded.some((d) => `${d.provider}/${d.modelId}.${d.field}` === "anthropic/claude-opus-4-6.context"),
    );

    const fallbackDiffKeys = plan.fallbackDiffs.map((d) => `${d.modelId}.${d.field}`);
    assert.ok(!fallbackDiffKeys.includes("claude-opus-4-6.context"));
    assert.ok(plan.fallbackExcluded.some((d) => `${d.modelId}.${d.field}` === "claude-opus-4-6.context"));

    const report = formatReport(plan, { write: false });
    assert.doesNotMatch(report, /=== Field differences: providers\/\*\.json ===\n[^=]*anthropic\/claude-opus-4-6\.context/);
  } finally {
    cleanup(repo, pi);
  }
});

// ---------------------------------------------------------------------------
// 3. --write output passes validate-catalog's own source-tree validation.
// ---------------------------------------------------------------------------

test("runSync --write: produces a source tree that validate-catalog accepts", async () => {
  const repo = makeRepoFixture();
  const pi = makePiDistFixture();
  try {
    const result = await runSync(repo, pi, { write: true });
    assert.ok(result.touchedFiles.length > 0, "expected at least one file to be written");
    assert.deepStrictEqual(validateSource(repo), []);

    const testProviderAfter = JSON.parse(readFileSync(join(repo, "providers", "testprovider.json"), "utf8"));
    assert.deepStrictEqual(testProviderAfter["model-a"], {
      name: "Test Model",
      context: 200000,
      maxOutput: 8192,
      image: true,
      reasoning: true,
    });

    // The excluded field must remain the curated value after --write.
    const anthropicAfter = JSON.parse(readFileSync(join(repo, "providers", "anthropic.json"), "utf8"));
    assert.strictEqual(anthropicAfter["claude-opus-4-6"].context, 200000);
  } finally {
    cleanup(repo, pi);
  }
});

// ---------------------------------------------------------------------------
// 4. Idempotency: a second --write run is a strict no-op.
// ---------------------------------------------------------------------------

test("runSync --write: a second run applies zero diffs and touches zero files", async () => {
  const repo = makeRepoFixture();
  const pi = makePiDistFixture();
  try {
    await runSync(repo, pi, { write: true });
    const afterFirst = {
      testprovider: readFileSync(join(repo, "providers", "testprovider.json"), "utf8"),
      anthropic: readFileSync(join(repo, "providers", "anthropic.json"), "utf8"),
      fallbacks: readFileSync(join(repo, "fallbacks.json"), "utf8"),
    };

    const second = await runSync(repo, pi, { write: true });
    assert.deepStrictEqual(second.plan.providerDiffs, []);
    assert.deepStrictEqual(second.plan.fallbackDiffs, []);
    assert.deepStrictEqual(second.touchedFiles, []);
    // The exclusion is reported every run — that's a permanent disagreement,
    // distinct from "a change was made" — so it must NOT be empty here.
    assert.ok(second.plan.providerExcluded.length > 0);

    const afterSecond = {
      testprovider: readFileSync(join(repo, "providers", "testprovider.json"), "utf8"),
      anthropic: readFileSync(join(repo, "providers", "anthropic.json"), "utf8"),
      fallbacks: readFileSync(join(repo, "fallbacks.json"), "utf8"),
    };
    assert.deepStrictEqual(afterSecond, afterFirst, "second --write must not change file bytes");
  } finally {
    cleanup(repo, pi);
  }
});

// ---------------------------------------------------------------------------
// Bonus: ambiguous fallback resolution (upstream providers disagree).
// ---------------------------------------------------------------------------

test("computeSyncPlan: an ambiguous fallback model id (disagreeing upstream providers) is reported and left untouched", async () => {
  const repo = mkdtempSync(join(tmpdir(), "hana-model-catalog-sync-ambig-repo-"));
  const pi = mkdtempSync(join(tmpdir(), "hana-model-catalog-sync-ambig-pi-"));
  try {
    mkdirSync(join(repo, "providers"));
    writeJson(join(repo, "providers", "onlyprovider.json"), {});
    writeJson(join(repo, "fallbacks.json"), {
      "shared-model": { name: "Shared Model", context: 50000, maxOutput: 4096, image: false, reasoning: false },
    });

    writeFileSync(join(pi, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    writeFileSync(
      join(pi, "models.generated.js"),
      `export const MODELS = ${JSON.stringify({
        providerx: { "shared-model": { contextWindow: 64000, maxTokens: 4096, input: [], reasoning: false } },
        providery: { "shared-model": { contextWindow: 128000, maxTokens: 4096, input: [], reasoning: false } },
      })};\n`,
      "utf8",
    );

    const MODELS = await loadPiModels(pi);
    const plan = computeSyncPlan(repo, MODELS);

    assert.ok(!plan.fallbackDiffs.some((d) => d.modelId === "shared-model" && d.field === "context"));
    assert.ok(plan.fallbackAmbiguous.some((a) => a.modelId === "shared-model" && a.field === "context"));
  } finally {
    cleanup(repo, pi);
  }
});

// ---------------------------------------------------------------------------
// 5. --pi-dist argument/path validation never guesses a default.
// ---------------------------------------------------------------------------

test("resolvePiDist: rejects a missing argument, a nonexistent path, and a directory without models.generated.js", () => {
  assert.throws(() => resolvePiDist(undefined), /--pi-dist/);

  const bogus = join(tmpdir(), "hana-model-catalog-sync-pi-does-not-exist-xyz");
  assert.throws(() => resolvePiDist(bogus), /does not exist or is not a directory/);

  const emptyDir = mkdtempSync(join(tmpdir(), "hana-model-catalog-sync-pi-empty-"));
  try {
    assert.throws(() => resolvePiDist(emptyDir), /models\.generated\.js/);
  } finally {
    cleanup(emptyDir);
  }
});
