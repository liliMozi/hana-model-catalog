// Fixture-based self-test of the CI rejection list from the repository's
// contract (spec section on repository CI rejects): for every category, at
// least one bad sample must be rejected and one good sample must pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateCatalogData,
  validateArtifact,
  parseJsonStrict,
  detectCaseInsensitiveCollisions,
  loadSourceCatalog,
  CatalogValidationError,
} from "../scripts/validate-catalog.mjs";

function goodProviderModel(overrides = {}) {
  return {
    name: "Test Model",
    context: 128000,
    maxOutput: 32768,
    image: false,
    video: false,
    audio: false,
    reasoning: true,
    toolUse: { supportsTools: true, dialect: "openai", toolResultFormat: "message" },
    quirks: ["needs-system-prompt"],
    ...overrides,
  };
}

function goodFallbackModel(overrides = {}) {
  return {
    name: "Test Fallback Model",
    context: 128000,
    maxOutput: 32768,
    image: false,
    reasoning: false,
    toolUse: { supportsTools: true, dialect: "openai", toolResultFormat: "message" },
    quirks: [],
    ...overrides,
  };
}

function providersOf(model) {
  return { testprovider: { "test-model": model } };
}

function fallbacksOf(model) {
  return { "test-model": model };
}

// ---------------------------------------------------------------------------
// 1. Duplicate provider identity (case-insensitive filename collision)
// ---------------------------------------------------------------------------

test("rejects: duplicate provider identity via case-insensitive filename collision", () => {
  const errors = detectCaseInsensitiveCollisions(["openai.json", "OpenAI.json"]);
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /collides case-insensitively/);
});

test("allows: distinct provider filenames", () => {
  const errors = detectCaseInsensitiveCollisions(["openai.json", "anthropic.json"]);
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 2. Duplicate model identity (duplicate JSON key)
// ---------------------------------------------------------------------------

test("rejects: duplicate model identity as a duplicate JSON key in a provider file", () => {
  const text = '{"model-a": {"name": "x"}, "model-a": {"name": "y"}}';
  assert.throws(() => parseJsonStrict(text, "providers/test.json"), CatalogValidationError);
});

test("allows: distinct model ids in a provider file", () => {
  const text = '{"model-a": {"name": "x"}, "model-b": {"name": "y"}}';
  const parsed = parseJsonStrict(text, "providers/test.json");
  assert.deepStrictEqual(Object.keys(parsed), ["model-a", "model-b"]);
});

// ---------------------------------------------------------------------------
// 3. Empty / malformed IDs
// ---------------------------------------------------------------------------

test("rejects: empty provider key and model id starting with underscore", () => {
  const errorsEmptyProvider = validateCatalogData({ "": { "model-a": goodProviderModel() } }, {});
  assert.ok(errorsEmptyProvider.some((e) => /invalid provider key/.test(e)));

  const errorsUnderscoreModel = validateCatalogData(
    { testprovider: { _comment: goodProviderModel() } },
    {},
  );
  assert.ok(errorsUnderscoreModel.some((e) => /invalid model id/.test(e)));
});

test("allows: a normal provider key and model id", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel()), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 4. Unknown fields
// ---------------------------------------------------------------------------

test("rejects: a model field outside the 20-field whitelist", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ notAField: 1 })), {});
  assert.ok(errors.some((e) => /is not a whitelisted model field/.test(e)));
});

test("allows: only whitelisted fields", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel()), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 5. Invalid numeric values
// ---------------------------------------------------------------------------

test("rejects: negative, fractional and stringly-typed numeric limits", () => {
  const negative = validateCatalogData(providersOf(goodProviderModel({ context: -5 })), {});
  assert.ok(negative.some((e) => /context must be a positive integer/.test(e)));

  const fractional = validateCatalogData(providersOf(goodProviderModel({ context: 1.5 })), {});
  assert.ok(fractional.some((e) => /context must be a positive integer/.test(e)));

  const stringly = validateCatalogData(providersOf(goodProviderModel({ context: "128000" })), {});
  assert.ok(stringly.some((e) => /context must be a positive integer/.test(e)));
});

test("allows: maxOutput: null (the one nullable numeric field)", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ maxOutput: null })), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 6. Credential material patterns
// ---------------------------------------------------------------------------

test("rejects: credential-material patterns (sk-, ghp_, AKIA, PEM private key)", () => {
  const samples = [
    "sk-abcdefghijklmnopqrstuvwxyz123456",
    "ghp_abcdefghijklmnopqrstuvwxyz012345",
    "AKIAABCDEFGHIJKLMNOP",
    "-----BEGIN RSA PRIVATE KEY-----",
  ];
  for (const s of samples) {
    const errors = validateCatalogData(providersOf(goodProviderModel({ name: s })), {});
    assert.ok(
      errors.some((e) => /credential-material pattern/.test(e)),
      `expected a credential-material rejection for: ${s}`,
    );
  }
});

test("allows: an ordinary model name with no credential-shaped substring", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ name: "GPT Example 5" })), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 7. URL / link strings
// ---------------------------------------------------------------------------

test("rejects: a URL-shaped string value", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ name: "https://evil.example/malicious" })), {});
  assert.ok(errors.some((e) => /looks like a URL/.test(e)));
});

test("allows: a string value that merely mentions a protocol name without being a URL", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ name: "HTTPS-capable Model" })), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 8. Executable / network instruction indicators
// ---------------------------------------------------------------------------

test("rejects: shell command substitution and dynamic require() indicators", () => {
  const shellSub = validateCatalogData(providersOf(goodProviderModel({ quirks: ["$(rm -rf /)"] })), {});
  assert.ok(shellSub.some((e) => /executable\/network-instruction pattern/.test(e)));

  const dynRequire = validateCatalogData(providersOf(goodProviderModel({ quirks: ["require(\"fs\")"] })), {});
  assert.ok(dynRequire.some((e) => /executable\/network-instruction pattern/.test(e)));
});

test("allows: ordinary descriptive quirks text", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ quirks: ["drops system prompt on retries"] })), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 9. Cross-field thinkingLevels / xhigh contradiction
// ---------------------------------------------------------------------------

test("rejects: xhigh:true with an explicit thinkingLevels array that omits \"max\"", () => {
  const errors = validateCatalogData(
    providersOf(goodProviderModel({ thinkingLevels: ["low", "medium", "high"], xhigh: true })),
    {},
  );
  assert.ok(errors.some((e) => /omits "max"/.test(e)));
});

test("allows: thinkingLevels containing \"max\" alongside xhigh:true (redundant but consistent)", () => {
  const errors = validateCatalogData(
    providersOf(goodProviderModel({ thinkingLevels: ["low", "medium", "high", "max"], xhigh: true })),
    {},
  );
  assert.deepStrictEqual(errors, []);
});

test("allows: xhigh:true with no thinkingLevels array at all (standard three-tier convention)", () => {
  const errors = validateCatalogData(providersOf(goodProviderModel({ xhigh: true })), {});
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// 10. Protocol-level fields forbidden in fallbacks
// ---------------------------------------------------------------------------

test("rejects: a protocol-level field (api) present on a fallback entry", () => {
  const errors = validateCatalogData({}, fallbacksOf(goodFallbackModel({ api: "openai-responses" })));
  assert.ok(errors.some((e) => /protocol-level field and is not allowed in fallbacks/.test(e)));
});

test("allows: a fallback entry with no protocol-level fields", () => {
  const errors = validateCatalogData({}, fallbacksOf(goodFallbackModel()));
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// Full-artifact envelope (schemaVersion / catalogVersion / publishedAt / top-level keys)
// ---------------------------------------------------------------------------

test("rejects: an artifact with an unsupported schemaVersion, missing keys, or bad publishedAt", () => {
  const base = {
    schemaVersion: 1,
    catalogVersion: 1,
    publishedAt: "2026-08-19T00:00:00.000Z",
    providers: {},
    fallbacks: {},
  };

  assert.ok(validateArtifact({ ...base, schemaVersion: 2 }).some((e) => /unsupported model catalog schemaVersion/.test(e)));
  assert.ok(validateArtifact({ ...base, catalogVersion: 0 }).some((e) => /catalogVersion must be a positive integer/.test(e)));
  assert.ok(validateArtifact({ ...base, publishedAt: "not-a-date" }).some((e) => /publishedAt must be a parseable date string/.test(e)));
  assert.ok(validateArtifact({ ...base, extraKey: 1 }).some((e) => /unknown top-level model catalog key/.test(e)));
  const { fallbacks, ...missingFallbacks } = base;
  assert.ok(validateArtifact(missingFallbacks).some((e) => /missing required top-level key: fallbacks/.test(e)));
});

test("allows: a minimal well-formed artifact envelope", () => {
  const errors = validateArtifact({
    schemaVersion: 1,
    catalogVersion: 1,
    publishedAt: "2026-08-19T00:00:00.000Z",
    providers: providersOf(goodProviderModel()),
    fallbacks: fallbacksOf(goodFallbackModel()),
  });
  assert.deepStrictEqual(errors, []);
});

// ---------------------------------------------------------------------------
// loadSourceCatalog end to end against a throwaway temp directory
// ---------------------------------------------------------------------------

test("loadSourceCatalog: rejects a source tree with a malformed (duplicate-key) provider file", () => {
  const dir = mkdtempSync(join(tmpdir(), "hana-model-catalog-test-"));
  try {
    mkdirSync(join(dir, "providers"));
    writeFileSync(join(dir, "providers", "testprovider.json"), '{"m": {"name":"a"}, "m": {"name":"b"}}', "utf8");
    writeFileSync(join(dir, "fallbacks.json"), "{}", "utf8");
    const { loadErrors } = loadSourceCatalog(dir);
    assert.ok(loadErrors.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSourceCatalog: allows a well-formed minimal source tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "hana-model-catalog-test-"));
  try {
    mkdirSync(join(dir, "providers"));
    writeFileSync(
      join(dir, "providers", "testprovider.json"),
      JSON.stringify({ "test-model": goodProviderModel() }),
      "utf8",
    );
    writeFileSync(join(dir, "fallbacks.json"), JSON.stringify(fallbacksOf(goodFallbackModel())), "utf8");
    const { providers, fallbacks, loadErrors } = loadSourceCatalog(dir);
    assert.deepStrictEqual(loadErrors, []);
    assert.deepStrictEqual(validateCatalogData(providers, fallbacks), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
