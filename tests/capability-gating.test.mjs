// Capability gating: the v2 `requiresCapabilities` field and the v1 projection.
//
// This suite pins the contract that lets a data-only repository add a model whose
// client support does not exist yet, without ever handing that model to a client
// that would mis-send it:
//
//   - the field is open-ended in *value* (an unknown capability id is valid data)
//     but strict in *shape*, so a malformed declaration fails at authoring time
//     instead of parsing as "no requirement" on the client;
//   - a wire value outside the frozen v1 vocabulary must carry a requirement,
//     because the client drops unknown compat values silently;
//   - v1 never carries the field at all — gated entries are removed whole;
//   - no alias route (fallback, `-free`/`:route` suffix, defaults) can reach a
//     gated entry through the v1 file;
//   - a requirement this repository has never seen does not fail the build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCatalogData,
  validateArtifact,
  projectV1FromV2,
} from "../scripts/validate-catalog.mjs";
import { buildCatalog } from "../scripts/build-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXED = { publishedAt: "2026-10-25T00:00:00Z" };

function model(overrides = {}) {
  return {
    name: "Test Model",
    context: 128000,
    maxOutput: 32768,
    image: false,
    reasoning: true,
    ...overrides,
  };
}

function v2(providers, fallbacks = {}, defaults = {}) {
  return validateCatalogData(providers, fallbacks, defaults, { version: 2 });
}

function v1(providers, fallbacks = {}, defaults = {}) {
  return validateCatalogData(providers, fallbacks, defaults, { version: 1 });
}

// ---------------------------------------------------------------------------
// Shape matrix: every malformed declaration is rejected, with a precise reason.
// ---------------------------------------------------------------------------

test("rejects: requiresCapabilities that is not an array, or is empty", () => {
  for (const bad of ["anthropic-adaptive", 1, true, null, {}]) {
    const errors = v2({ p: { m: model({ requiresCapabilities: bad }) } });
    assert.ok(
      errors.some((e) => /requiresCapabilities must be an array of capability ids/.test(e)),
      `expected an array-shape error for ${JSON.stringify(bad)}`,
    );
  }
  const empty = v2({ p: { m: model({ requiresCapabilities: [] }) } });
  assert.ok(empty.some((e) => /must not be empty/.test(e)),
    "an empty array must be rejected: it is indistinguishable from no declaration");
});

test("rejects: every malformed element shape", () => {
  const cases = [
    [[42], /must be a string/],
    [[null], /must be a string/],
    [[""], /must not be empty or whitespace-only/],
    [["   "], /must not be empty or whitespace-only/],
    [[" padded"], /must not have leading or trailing whitespace/],
    [["padded "], /must not have leading or trailing whitespace/],
    [["https://evil.example/cap"], /must be a non-URL string/],
    [["a".repeat(65)], /must be at most 64 characters/],
    [["ctrl\u0001char"], /must not contain control characters/],
    [["dup", "dup"], /duplicates capability id "dup"/],
  ];
  for (const [value, expected] of cases) {
    const errors = v2({ p: { m: model({ requiresCapabilities: value }) } });
    assert.ok(
      errors.some((e) => expected.test(e)),
      `expected ${expected} for ${JSON.stringify(value)}, got ${JSON.stringify(errors)}`,
    );
  }
});

test("rejects: more than 64 capability ids on one entry", () => {
  const ids = Array.from({ length: 65 }, (_, i) => `cap-${i}`);
  const errors = v2({ p: { m: model({ requiresCapabilities: ids }) } });
  assert.ok(errors.some((e) => /must have at most 64 elements/.test(e)));
});

test("allows: a well-formed declaration, including exactly 64 ids", () => {
  const ids = Array.from({ length: 64 }, (_, i) => `cap-${i}`);
  assert.deepStrictEqual(v2({ p: { m: model({ requiresCapabilities: ids }) } }), []);
  assert.deepStrictEqual(v2({ p: { m: model({ requiresCapabilities: ["a.b-c_d"] }) } }), []);
});

// ---------------------------------------------------------------------------
// Open vocabulary: a future capability id must never fail this repository.
// ---------------------------------------------------------------------------

test("allows: a capability id this repository has never heard of", () => {
  assert.deepStrictEqual(
    v2({ p: { m: model({ requiresCapabilities: ["hana.cap.some-future-thing"] }) } }),
    [],
    "the capability vocabulary belongs to the client; unknown ids are valid data",
  );
});

test("a future capability requirement does not fail the source tree or the build", () => {
  // Structural level only: this drives the validators, not the real tree, so it
  // proves the shape rules admit an unknown id without depending on curation.
  const errors = v2({
    provider: {
      "future-model": model({
        requiresCapabilities: ["hana.cap.not-implemented-yet", "another.future-cap"],
        compat: { thinkingFormat: "anthropic", reasoningProfile: "brand-new-profile" },
      }),
    },
  });
  assert.deepStrictEqual(errors, [], "an unknown id must satisfy the gate for an unknown wire value");
});

// ---------------------------------------------------------------------------
// v1 must reject the field outright: its whitelist is frozen at 20.
// ---------------------------------------------------------------------------

test("rejects: requiresCapabilities in a v1 document", () => {
  const errors = v1({ p: { m: model({ requiresCapabilities: ["x"] }) } });
  assert.ok(errors.some((e) => /is not a whitelisted model field/.test(e)),
    "v1 must reject the field rather than ignore it");
});

test("rejects: requiresCapabilities on a v1 fallback", () => {
  const errors = v1({}, { m: model({ requiresCapabilities: ["x"] }) });
  assert.ok(errors.some((e) => /is not a whitelisted model field/.test(e)));
});

test("allows: requiresCapabilities on a v2 fallback but still forbids the wire fields there", () => {
  assert.deepStrictEqual(v2({}, { m: model({ requiresCapabilities: ["x"] }) }), []);
  for (const field of ["api", "compat", "thinkingLevels", "thinkingLevelMap", "defaultThinkingLevel"]) {
    const errors = v2({}, { m: model({ requiresCapabilities: ["x"], [field]: field === "api" ? "openai-completions" : field === "thinkingLevels" ? ["low"] : field === "defaultThinkingLevel" ? "high" : field === "thinkingLevelMap" ? { xhigh: "max" } : { thinkingFormat: "anthropic" } }) });
    assert.ok(
      errors.some((e) => /protocol-level field and is not allowed in fallbacks/.test(e)),
      `${field} must stay forbidden on fallbacks even with a requirement present`,
    );
  }
});

test("the gate is a compatibility requirement, so it is not in the protocol-only set", () => {
  // Direct statement of the design decision: if this field were treated as a
  // wire contract, a fallback carrying it would be the natural way to smuggle
  // the contract to an unknown provider.
  const errors = v2({}, { m: model({ requiresCapabilities: ["x"] }) });
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// Unknown wire values need a requirement (v2, provider entries only).
// ---------------------------------------------------------------------------

test("rejects: an unknown thinkingFormat without a capability requirement", () => {
  const errors = v2({ p: { m: model({ compat: { thinkingFormat: "brand-new-format" } }) } });
  assert.ok(errors.some((e) => /thinkingFormat .* is not a v1-safe value/.test(e)));
});

test("rejects: an unknown reasoningProfile without a capability requirement", () => {
  const errors = v2({ p: { m: model({ compat: { reasoningProfile: "brand-new-profile" } }) } });
  assert.ok(errors.some((e) => /reasoningProfile .* is not a v1-safe value/.test(e)));
});

test("allows: the same unknown wire values once they are gated", () => {
  const errors = v2({
    p: {
      m: model({
        requiresCapabilities: ["some.cap"],
        compat: { thinkingFormat: "brand-new-format", reasoningProfile: "brand-new-profile" },
      }),
    },
  });
  assert.deepStrictEqual(errors, []);
});

test("unknown tool wire values require gates even without compat and on fallbacks", () => {
  for (const field of ["dialect", "toolResultFormat"]) {
    const entry = model({ toolUse: { supportsTools: true, dialect: "openai", toolResultFormat: "message", [field]: "future-wire" } });
    assert.ok(v2({ p: { m: entry } }).some(e => e.includes(`toolUse.${field}`)));
    assert.ok(v2({}, { m: entry }).some(e => e.includes(`toolUse.${field}`)));
    const gated = { ...entry, requiresCapabilities: ["future-tools"] };
    assert.deepStrictEqual(v2({ p: { m: gated } }, { m: gated }), []);
    assert.deepStrictEqual(projectV1FromV2({ p: { m: gated } }, { m: gated }, { p: ["m"] }),
      { providers: { p: {} }, fallbacks: {}, defaults: { p: [] } });
  }
});

test("artifact version expectations cannot reinterpret another generation", () => {
  for (const [declared, expected] of [[1, 2], [2, 1]]) {
    const artifact = { schemaVersion: declared, publishedAt: FIXED.publishedAt, providers: {}, fallbacks: {}, defaults: {} };
    assert.ok(validateArtifact(artifact, { version: expected }).some(e => e.includes("was required")));
  }
});

test("allows: every frozen v1 wire value without a requirement", () => {
  // The complete frozen v1 vocabulary, one entry per value: none of these may be
  // forced to gate. A regression here would start silently gating current models.
  const thinkingFormats = ["anthropic", "qwen", "qwen-chat-template", "google-thinking-level",
    "zhipu", "deepseek", "openrouter", "kimi", "volcengine", "longcat"];
  const reasoningProfiles = ["anthropic-adaptive-only", "deepseek-v4-anthropic",
    "deepseek-v4-openai", "deepseek-v4-responses", "mimo-openai",
    "openrouter-anthropic-adaptive", "zhipu-openai", "kimi-openai"];

  const providers = { p: {} };
  thinkingFormats.forEach((f, i) => {
    providers.p[`tf-${i}`] = model({ compat: { thinkingFormat: f } });
  });
  reasoningProfiles.forEach((profile, i) => {
    providers.p[`rp-${i}`] = model({ compat: { reasoningProfile: profile } });
  });
  assert.deepStrictEqual(v2(providers), []);
});

test("rejects: a wire value the client gained after the frozen snapshot still needs a gate", () => {
  // `anthropic-adaptive` was added to the client in a later commit, so it is
  // deliberately NOT in the frozen v1 set: a v1 reader would drop it and send
  // the always-on shape instead.
  const errors = v2({ p: { m: model({ compat: { reasoningProfile: "anthropic-adaptive" } }) } });
  assert.ok(errors.some((e) => /reasoningProfile "anthropic-adaptive" is not a v1-safe value/.test(e)));
});

// ---------------------------------------------------------------------------
// Anti-bypass: a fallback that aliases a gated entry must declare the same gate.
// ---------------------------------------------------------------------------

test("rejects: a fallback aliasing a gated entry without the same requirement", () => {
  const errors = v2(
    { p: { "gated-model": model({ requiresCapabilities: ["cap.a"] }) } },
    { "gated-model": model() },
  );
  assert.ok(errors.some((e) => /aliases the gated entry providers\.p\.gated-model/.test(e)));
  assert.ok(errors.some((e) => /would bypass the capability gate/.test(e)));
});

test("rejects: a fallback declaring only part of a gated entry's requirements", () => {
  const errors = v2(
    { p: { m: model({ requiresCapabilities: ["cap.a", "cap.b"] }) } },
    { m: model({ requiresCapabilities: ["cap.a"] }) },
  );
  assert.ok(errors.some((e) => /does not declare \["cap\.b"\]/.test(e)));
});

test("allows: a fallback declaring the same requirements, or a superset", () => {
  assert.deepStrictEqual(
    v2({ p: { m: model({ requiresCapabilities: ["cap.a"] }) } },
      { m: model({ requiresCapabilities: ["cap.a"] }) }),
    [],
  );
  assert.deepStrictEqual(
    v2({ p: { m: model({ requiresCapabilities: ["cap.a"] }) } },
      { m: model({ requiresCapabilities: ["cap.a", "cap.b"] }) }),
    [],
  );
});

test("rejects: alias routes around a gated entry, not just the literal id", () => {
  const cases = [
    ["gated-model", "gated-model-free", "the -free suffix the client strips"],
    ["gated-model", "gated-model:somewhere", "the :route suffix the client strips"],
    ["anthropic/gated-model", "gated-model", "the vendor namespace the client strips"],
    ["claude-opus-5.5", "claude-opus-5-5", "the dotted Claude version the client normalizes"],
    ["claude-haiku-5-5", "CLAUDE-HAIKU-5-5", "case-insensitive client lookup"],
    ["claude-haiku-5-5", "claude-5.5-haiku", "reordered Claude versions"],
  ];
  for (const [providerId, fallbackId, why] of cases) {
    const errors = v2(
      { p: { [providerId]: model({ requiresCapabilities: ["cap.a"] }) } },
      { [fallbackId]: model() },
    );
    assert.ok(
      errors.some((e) => /would bypass the capability gate/.test(e)),
      `expected an alias bypass error for ${fallbackId} (${why})`,
    );
  }
});

test("allows: a fallback alias that carries the same requirement", () => {
  const errors = v2(
    { p: { "gated-model": model({ requiresCapabilities: ["cap.a"] }) } },
    { "gated-model-free": model({ requiresCapabilities: ["cap.a"] }) },
  );
  assert.deepStrictEqual(errors, []);
});

test("allows: an unrelated fallback is untouched by gating", () => {
  assert.deepStrictEqual(
    v2({ p: { m: model({ requiresCapabilities: ["cap.a"] }) } }, { unrelated: model() }),
    [],
  );
});

// ---------------------------------------------------------------------------
// v1 projection: pure, deterministic removal.
// ---------------------------------------------------------------------------

test("projection removes gated entries and keeps every other entry untouched", () => {
  const providers = {
    p: {
      gated: model({ requiresCapabilities: ["cap.a"] }),
      plain: model({ name: "Plain" }),
    },
    q: { only: model({ requiresCapabilities: ["cap.b"] }) },
  };
  const fallbacks = {
    gated: model({ requiresCapabilities: ["cap.a"] }),
    plain: model({ name: "Plain fallback" }),
  };
  const defaults = { p: ["gated", "plain"], q: ["only"] };

  const projected = projectV1FromV2(providers, fallbacks, defaults);

  assert.deepStrictEqual(Object.keys(projected.providers.p).sort(), ["plain"]);
  assert.deepStrictEqual(projected.providers.q, {}, "a partition emptied by gating keeps its key");
  assert.deepStrictEqual(projected.providers.p.plain, providers.p.plain, "a kept entry is not rewritten");
  assert.deepStrictEqual(Object.keys(projected.fallbacks), ["plain"]);
  assert.deepStrictEqual(projected.defaults, { p: ["plain"], q: [] },
    "gated ids leave the default list, the provider key and its order stay");
});

test("projection keeps every provider key even when all of its entries are gated", () => {
  const projected = projectV1FromV2({ p: { a: model({ requiresCapabilities: ["c"] }) } }, {}, {});
  assert.deepStrictEqual(Object.keys(projected.providers), ["p"]);
});

test("projection is determined by the data alone", () => {
  const providers = { p: { gated: model({ requiresCapabilities: ["cap.a"] }), plain: model() } };
  const first = projectV1FromV2(providers, {}, { p: ["gated", "plain"] });
  const second = projectV1FromV2(providers, {}, { p: ["gated", "plain"] });
  assert.deepStrictEqual(first, second);
  assert.deepStrictEqual(v1(first.providers, first.fallbacks, first.defaults), []);
});

// ---------------------------------------------------------------------------
// Real tree: the shipped artifacts.
// ---------------------------------------------------------------------------

const { catalog: v2Catalog, v1Catalog } = buildCatalog(REPO_ROOT, FIXED);

test("the shipped v2 artifact validates under v2 rules and the v1 artifact under v1 rules", () => {
  assert.deepStrictEqual(validateArtifact(v2Catalog), []);
  assert.deepStrictEqual(validateArtifact(v1Catalog), []);
  assert.equal(v2Catalog.schemaVersion, 2);
  assert.equal(v1Catalog.schemaVersion, 1);
  assert.equal(v1Catalog.publishedAt, v2Catalog.publishedAt,
    "the two views must be the same age");
});

test("the shipped v1 artifact carries no capability field anywhere", () => {
  assert.equal(JSON.stringify(v1Catalog).includes("requiresCapabilities"), false,
    "a leaked requirement would mean v1 kept a gated entry");
});

test("the shipped v2 artifact keeps every gated entry out of the v1 artifact", () => {
  const gated = [];
  for (const [provider, models] of Object.entries(v2Catalog.providers)) {
    for (const [modelId, entry] of Object.entries(models)) {
      if (Array.isArray(entry.requiresCapabilities)) gated.push([provider, modelId]);
    }
  }
  assert.ok(gated.length > 0, "the current tree must exercise gating");
  for (const [provider, modelId] of gated) {
    assert.equal(v1Catalog.providers[provider]?.[modelId], undefined,
      `providers.${provider}.${modelId} is gated and must not appear in v1`);
    assert.equal(v1Catalog.fallbacks[modelId], undefined,
      `fallbacks.${modelId} is gated and must not appear in v1`);
    assert.equal(v1Catalog.defaults[provider]?.includes(modelId) ?? false, false,
      `defaults.${provider} must not list the gated ${modelId}`);
  }
});

test("the shipped gated entries declare exactly the agreed capability ids", () => {
  assert.deepStrictEqual(v2Catalog.providers.anthropic['claude-haiku-5-5'].requiresCapabilities,
    ['anthropic-adaptive']);
  assert.deepStrictEqual(v2Catalog.fallbacks['claude-haiku-5-5'].requiresCapabilities,
    ['anthropic-adaptive']);
  for (const id of ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed']) {
    assert.deepStrictEqual(v2Catalog.providers.moonshot[id].requiresCapabilities,
      ['kimi-k31-native-openai']);
    assert.deepStrictEqual(v2Catalog.fallbacks[id].requiresCapabilities,
      ['kimi-k31-native-openai']);
  }
  for (const id of ['k3.1-pro', 'k3.1-pro-highspeed']) {
    assert.deepStrictEqual(v2Catalog.providers['kimi-coding'][id].requiresCapabilities,
      ['kimi-k31-coding-openai']);
  }
});

test("entries that already have adapters are not gated", () => {
  // Sonnet 5.5 and Argon are implemented by the current client, so gating them
  // would remove them from old clients for no reason.
  for (const [provider, id] of [
    ['anthropic', 'claude-sonnet-5-5'],
    ['anthropic', 'claude-opus-5-5'],
    ['anthropic', 'claude-fable-5-1'],
    ['gemini', 'gemini-4-argon'],
    ['gemini', 'gemini-3.8-flash'],
    ['openrouter', 'google/gemini-4-argon'],
  ]) {
    assert.equal(v2Catalog.providers[provider][id].requiresCapabilities, undefined,
      `${provider}/${id} must not be gated`);
    assert.ok(v1Catalog.providers[provider][id], `${provider}/${id} must survive in v1`);
  }
});

test("the corrected K3 fields still express in v1, so K3 itself is not gated", () => {
  for (const id of ['k3', 'k3-256k']) {
    const entry = v2Catalog.providers['kimi-coding'][id];
    assert.equal(entry.requiresCapabilities, undefined);
    assert.ok(v1Catalog.providers['kimi-coding'][id], `${id} must survive in v1`);
    assert.deepStrictEqual(v1Catalog.providers['kimi-coding'][id], entry,
      `${id} is unchanged between the two artifacts`);
  }
});
