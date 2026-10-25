#!/usr/bin/env node
// scripts/validate-catalog.mjs
//
// Validator for the hana-model-catalog source tree (providers/*.json,
// fallbacks.json, defaults.json) and for both compiled artifacts
// (model-catalog.v1.json, model-catalog.v2.json).
//
// Two schema generations are validated here. The v1 rules are frozen exactly as
// they shipped: 20 model fields, closed compat enums, no capability gating. The
// v2 rules reuse every common rule and add exactly one field,
// `requiresCapabilities`, for a 21-field entry (see the capability-gating block
// below). v1 artifacts are still produced, as a deterministic projection of the
// v2 data with every gated entry removed, so a client that predates v2 keeps
// receiving a catalog it can parse instead of rejecting the whole file.
//
// This is the CI tripwire for the repository contract described in this
// repo's README and in the application's model-information update
// specification: a catalog cannot carry URLs, credential material or
// executable instructions, so a bad catalog can at worst misdescribe model
// metadata until a corrected version is published.
//
// The structural/type rules in this file are a faithful, hand-ported mirror
// of the application's runtime client-side catalog validator (the 20-field
// whitelist, the protocol-only-fields-forbidden-in-fallbacks rule, and the
// thinkingLevels/xhigh cross-field contradiction rule). They must be kept in
// sync by hand — there is no shared package between this repository and the
// application. If the application's field whitelist ever changes, this file
// needs a matching edit.
//
// On top of that structural mirror, this script additionally enforces the
// CI-only rejection list: duplicate provider/model identity, credential
// material patterns, and executable/network instruction indicators. Unlike
// the application's validator (which throws on the first violation, because
// it only needs a yes/no admission decision at load time), this script
// collects every violation it finds and reports them all before exiting
// non-zero, so a single CI run surfaces the complete list of problems.
//
// Zero runtime dependencies. Node >= 18.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CatalogValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

// ---------------------------------------------------------------------------
// Strict JSON parsing with duplicate-key detection.
//
// Plain JSON.parse silently keeps the last value when a key repeats in the
// source text — by the time a reviver could inspect the result, the
// duplicate is already gone. A hand-rolled recursive-descent parser is the
// only reliable way to catch this at every nesting level (provider file
// top-level, one provider's model ids, and any nested field object).
// ---------------------------------------------------------------------------

export function parseJsonStrict(text, label) {
  let i = 0;
  const n = text.length;

  function posInfo() {
    let line = 1;
    let col = 1;
    for (let k = 0; k < i && k < n; k++) {
      if (text[k] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return `line ${line}, column ${col}`;
  }

  function fail(msg) {
    throw new CatalogValidationError(`${label}: ${msg} (at ${posInfo()})`);
  }

  function skipWs() {
    while (i < n) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
      else break;
    }
  }

  function parseValue() {
    skipWs();
    if (i >= n) fail("unexpected end of input");
    const c = text[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "t") return parseLiteral("true", true);
    if (c === "f") return parseLiteral("false", false);
    if (c === "n") return parseLiteral("null", null);
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    fail(`unexpected character ${JSON.stringify(c)}`);
  }

  function parseLiteral(lit, value) {
    if (text.slice(i, i + lit.length) !== lit) fail(`invalid literal, expected "${lit}"`);
    i += lit.length;
    return value;
  }

  function parseObject() {
    i++; // consume "{"
    const obj = {};
    const seen = new Set();
    skipWs();
    if (text[i] === "}") {
      i++;
      return obj;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail("expected string key");
      const key = parseString();
      skipWs();
      if (text[i] !== ":") fail('expected ":"');
      i++;
      const value = parseValue();
      if (seen.has(key)) fail(`duplicate key ${JSON.stringify(key)}`);
      seen.add(key);
      obj[key] = value;
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        break;
      }
      fail('expected "," or "}"');
    }
    return obj;
  }

  function parseArray() {
    i++; // consume "["
    const arr = [];
    skipWs();
    if (text[i] === "]") {
      i++;
      return arr;
    }
    for (;;) {
      arr.push(parseValue());
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        break;
      }
      fail('expected "," or "]"');
    }
    return arr;
  }

  function parseString() {
    i++; // consume opening quote
    let out = "";
    for (;;) {
      if (i >= n) fail("unterminated string");
      const c = text[i];
      if (c === '"') {
        i++;
        break;
      }
      if (c === "\\") {
        i++;
        const e = text[i];
        if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else if (e === "/") out += "/";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "u") {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          fail(`invalid escape character ${JSON.stringify(e)}`);
        }
        i++;
      } else if (c.charCodeAt(0) < 0x20) {
        fail("invalid control character in string");
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function parseNumber() {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") {
      i++;
    } else if (text[i] >= "1" && text[i] <= "9") {
      while (text[i] >= "0" && text[i] <= "9") i++;
    } else {
      fail("invalid number");
    }
    if (text[i] === ".") {
      i++;
      if (!(text[i] >= "0" && text[i] <= "9")) fail("invalid number");
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (!(text[i] >= "0" && text[i] <= "9")) fail("invalid number");
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
    return Number(text.slice(start, i));
  }

  const value = parseValue();
  skipWs();
  if (i < n) fail("unexpected trailing content after top-level value");
  return value;
}

// ---------------------------------------------------------------------------
// Shared primitives (mirrors the application's built-in catalog validator).
// ---------------------------------------------------------------------------

// Load-bearing rule: no string value anywhere in the catalog may be a URL.
// This is the precondition the update channel's no-signature decision rests
// on (a URL field would let a compromised catalog redirect a client's next
// download). Prefix-anchored per the application's own validator.
const URL_LIKE = /^https?:\/\//i;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isValidIdentifierKey(key) {
  return typeof key === "string" && key.length > 0 && key.trim().length > 0 && !key.startsWith("_");
}

function isSafeString(value) {
  return typeof value === "string" && !URL_LIKE.test(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// v1's frozen 20-field whitelist. One more field than this and the entry is
// rejected. This set must never grow: an added field is exactly what makes a
// pre-v2 client reject the whole artifact.
const MODEL_FIELDS_V1 = new Set([
  "name", "context", "maxContext", "maxOutput", "image", "video", "audio",
  "reasoning", "toolUse", "type", "api", "compat", "quirks", "thinkingLevels",
  "thinkingLevelMap", "defaultThinkingLevel", "visionCapabilities", "xhigh",
  "legacyCompatibility", "serviceTiers",
]);

// v2 adds exactly one field. `requiresCapabilities` is a *compatibility
// requirement*, not a wire parameter: it names client capabilities the entry
// depends on, so a client that lacks them can skip the entry instead of
// mis-sending it. It is therefore allowed on provider entries AND on fallbacks
// (see PROTOCOL_ONLY_FIELDS below for the fields that stay provider-only).
const REQUIRES_CAPABILITIES_FIELD = "requiresCapabilities";
const MODEL_FIELDS_V2 = new Set([...MODEL_FIELDS_V1, REQUIRES_CAPABILITIES_FIELD]);

// Protocol-level fields are forbidden on fallback entries: an unknown/custom
// provider must never implicitly inherit another provider's wire contract
// from the generic fallback baseline. `requiresCapabilities` is deliberately
// NOT in this set — it carries no wire contract, and a fallback that omitted
// the requirement of its provider-scoped twin would be a bypass channel (see
// validateGateAliasCoverage).
const PROTOCOL_ONLY_FIELDS = new Set([
  "api", "compat", "thinkingLevels", "thinkingLevelMap", "defaultThinkingLevel",
  "legacyCompatibility", "maxContext", "serviceTiers",
]);

// ---------------------------------------------------------------------------
// Capability gating (v2 only)
//
// A capability id is an opaque, open-ended string owned by the client. This
// repository validates its *shape* only: it must never fail because a future
// client introduced a capability id this repo has never heard of. The two
// closed sets below exist for a different purpose — deciding which wire values
// are safe to hand to a pre-v2 client — and are not a capability vocabulary.
// ---------------------------------------------------------------------------

const MAX_CAPABILITY_ID_LENGTH = 64;
const MAX_CAPABILITIES_PER_ENTRY = 64;

// Reverse-order Claude id shape used by some provider gateways:
// `claude-<major>.<minor>-<family>`. Used only to build comparison keys.
const CLAUDE_REVERSE_ORDER = /^claude-(\d+)\.(\d+)-(opus|sonnet|haiku)$/;

// Frozen request-side compatibility vocabulary for the supported v1 reader
// baseline. This is not a claim that every historical reader knows these values.
// `anthropic-adaptive` is outside this baseline. Any wire value outside these
// sets must be gated so the v1 artifact does not introduce a value that a reader
// would silently drop before sending a different request shape.
const LEGACY_V1_THINKING_FORMATS = new Set([
  "anthropic",
  "qwen",
  "qwen-chat-template",
  "google-thinking-level",
  "zhipu",
  "deepseek",
  "openrouter",
  "kimi",
  "volcengine",
  "longcat",
]);

const LEGACY_V1_REASONING_PROFILES = new Set([
  "anthropic-adaptive-only",
  "deepseek-v4-anthropic",
  "deepseek-v4-openai",
  "deepseek-v4-responses",
  "mimo-openai",
  "openrouter-anthropic-adaptive",
  "zhipu-openai",
  "kimi-openai",
]);

// The same frozen snapshot's tool-call vocabulary:
//   TOOL_USE_DIALECTS and TOOL_RESULT_FORMATS.
//
// `toolUse` is not a protocol-only field here (fallbacks may carry it), and the
// legacy client's tool-contract normalizer returns null — dropping the whole
// contract — when either value is unrecognized. An unknown dialect therefore
// leaks into v1 as an entry whose tool contract silently disappears, which is
// the same failure class as an unknown compat profile and needs the same gate.
const LEGACY_V1_TOOL_DIALECTS = new Set([
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "none",
]);

const LEGACY_V1_TOOL_RESULT_FORMATS = new Set([
  "message",
  "content_block",
  "part",
]);

const BOOLEAN_FIELDS = new Set(["image", "video", "audio", "reasoning", "xhigh", "legacyCompatibility"]);

const TYPE_ENUM = new Set(["image"]);
const DEFAULT_THINKING_LEVEL_ENUM = new Set(["high", "low", "medium", "max"]);
const API_ENUM = new Set(["openai-codex-responses", "openai-completions", "openai-responses"]);

const TOOL_USE_KEYS = Object.freeze({ supportsTools: "boolean", dialect: "string", toolResultFormat: "string" });
const COMPAT_KEYS = Object.freeze({
  thinkingFormat: "string",
  reasoningProfile: "string",
  supportsReasoningEffort: "boolean",
});
const VISION_CAPABILITY_KEYS = Object.freeze({
  grounding: "boolean",
  boxes: "boolean",
  points: "boolean",
  coordinateSpace: "string",
  boxOrder: "string",
  outputFormat: "string",
  groundingMode: "string",
});

const THINKING_LEVEL_MAP_KEYS = new Set(["off", "low", "medium", "high", "xhigh", "minimal"]);
const THINKING_LEVEL_MAP_NULLABLE_KEYS = new Set(["off", "minimal"]);

const SERVICE_TIER_ENUM = new Set(["standard", "fast"]);

function validateServiceTiers(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}.serviceTiers must be a non-empty array`);
    return;
  }
  const seen = new Set();
  for (const tier of value) {
    if (!SERVICE_TIER_ENUM.has(tier)) {
      errors.push(`${path}.serviceTiers has an unrecognized value: ${JSON.stringify(tier)}`);
      continue;
    }
    if (seen.has(tier)) {
      errors.push(`${path}.serviceTiers has a duplicate value: ${JSON.stringify(tier)}`);
      continue;
    }
    seen.add(tier);
  }
}

function validateFlatObjectField(fieldName, value, keyTypes, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path}.${fieldName} must be a JSON object`);
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(keyTypes, key)) {
      errors.push(`${path}.${fieldName} has an unknown key: ${key}`);
      continue;
    }
    const expected = keyTypes[key];
    if (expected === "boolean" && typeof v !== "boolean") {
      errors.push(`${path}.${fieldName}.${key} must be boolean`);
    } else if (expected === "string" && !isSafeString(v)) {
      errors.push(`${path}.${fieldName}.${key} must be a non-URL string`);
    }
  }
}

function validateThinkingLevelMap(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path}.thinkingLevelMap must be a JSON object`);
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    if (!THINKING_LEVEL_MAP_KEYS.has(key)) {
      errors.push(`${path}.thinkingLevelMap has an unknown key: ${key}`);
      continue;
    }
    if (v === null) {
      if (!THINKING_LEVEL_MAP_NULLABLE_KEYS.has(key)) {
        errors.push(`${path}.thinkingLevelMap.${key} must not be null`);
      }
      continue;
    }
    if (!isSafeString(v)) {
      errors.push(`${path}.thinkingLevelMap.${key} must be a non-URL string or null`);
    }
  }
}

function validateStringArray(fieldName, value, path, errors) {
  if (!Array.isArray(value) || value.some((element) => !isSafeString(element))) {
    errors.push(`${path}.${fieldName} must be an array of non-URL strings`);
  }
}

// Cross-field guard: an explicit thinkingLevels array wins at read time
// over the xhigh boolean. If the array omits "max", xhigh:true is a
// silently-broken promise — the user could select max but the request
// gets downgraded to high without any error. A redundant-but-consistent
// combination (array contains "max" AND xhigh:true) is allowed. Only
// checked on provider entries: fallbacks already forbid thinkingLevels
// outright, so the contradiction cannot arise there.
function checkXhighThinkingLevelAgreement(model, path, errors) {
  if (!Array.isArray(model.thinkingLevels)) return;
  if (model.xhigh !== true) return;
  if (model.thinkingLevels.includes("max")) return;
  errors.push(
    `${path} declares xhigh:true but thinkingLevels ${JSON.stringify(model.thinkingLevels)} omits "max" — `
      + `the array wins at read time and the xhigh promise is silently dropped; add "max" to thinkingLevels or remove xhigh`,
  );
}

/**
 * Shape of a capability requirement list (v2 only).
 *
 * Deliberately open-ended: no element is ever checked against a known
 * capability vocabulary, because the vocabulary belongs to the client and this
 * repository must accept a requirement it has never seen. Only the shape is
 * pinned, so a malformed or empty declaration is caught at authoring time
 * instead of silently parsing as "no requirement" on the client.
 */
function validateRequiresCapabilities(value, path, errors) {
  const field = `${path}.${REQUIRES_CAPABILITIES_FIELD}`;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of capability ids`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${field} must not be empty: an empty declaration is indistinguishable from no declaration`);
    return;
  }
  if (value.length > MAX_CAPABILITIES_PER_ENTRY) {
    errors.push(`${field} must have at most ${MAX_CAPABILITIES_PER_ENTRY} elements`);
  }
  const seen = new Set();
  value.forEach((capabilityId, idx) => {
    const elementPath = `${field}[${idx}]`;
    if (typeof capabilityId !== "string") {
      errors.push(`${elementPath} must be a string`);
      return;
    }
    if (!isSafeString(capabilityId)) {
      errors.push(`${elementPath} must be a non-URL string`);
      return;
    }
    if (capabilityId.trim().length === 0) {
      errors.push(`${elementPath} must not be empty or whitespace-only`);
      return;
    }
    if (capabilityId !== capabilityId.trim()) {
      errors.push(`${elementPath} must not have leading or trailing whitespace`);
      return;
    }
    if (capabilityId.length > MAX_CAPABILITY_ID_LENGTH) {
      errors.push(`${elementPath} must be at most ${MAX_CAPABILITY_ID_LENGTH} characters`);
      return;
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(capabilityId)) {
      errors.push(`${elementPath} must not contain control characters`);
      return;
    }
    if (seen.has(capabilityId)) {
      errors.push(`${elementPath} duplicates capability id ${JSON.stringify(capabilityId)}`);
      return;
    }
    seen.add(capabilityId);
  });
}

/** The capability ids an entry declares, as a de-duplicated array (empty when absent). */
function declaredCapabilities(model) {
  const raw = model?.[REQUIRES_CAPABILITIES_FIELD];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id) => typeof id === "string" && id.trim().length > 0))];
}

/**
 * A wire value this repository has no v1 precedent for needs an explicit
 * capability requirement.
 *
 * Rationale: legacy protocol and tool-contract normalizers drop unrecognized
 * values instead of failing, so a
 * new `compat` value or tool dialect reaching a v1 reader does not error — it
 * silently changes which request shape that reader sends (or drops the tool
 * contract entirely). Requiring the gate at authoring time converts a silent
 * mis-send into an entry that the v1 projection removes.
 *
 * Each wire family is checked independently: an entry with no `compat` at all
 * still gets its `toolUse` inspected, and vice versa. Skipping either family
 * because the other is absent would reopen exactly the leak this guard exists
 * to close.
 *
 * Scoped to provider entries: fallbacks cannot carry `compat`
 * (PROTOCOL_ONLY_FIELDS), though they can carry `toolUse`, so a fallback's tool
 * dialect is checked on its own path by validateFallbackToolUse.
 */
function checkUnknownWireNeedsCapability(model, path, errors) {
  if (declaredCapabilities(model).length > 0) return;

  const compat = model.compat;
  if (isPlainObject(compat)) {
    const thinkingFormat = lower(compat.thinkingFormat);
    if (thinkingFormat && !LEGACY_V1_THINKING_FORMATS.has(thinkingFormat)) {
      errors.push(
        `${path}.compat.thinkingFormat ${JSON.stringify(compat.thinkingFormat)} is not a v1-safe value `
          + `and a v1 reader would silently drop it; declare ${REQUIRES_CAPABILITIES_FIELD}`,
      );
    }

    const reasoningProfile = lower(compat.reasoningProfile || compat.thinkingProfile);
    if (reasoningProfile && !LEGACY_V1_REASONING_PROFILES.has(reasoningProfile)) {
      errors.push(
        `${path}.compat.reasoningProfile ${JSON.stringify(compat.reasoningProfile)} is not a v1-safe value `
          + `and a v1 reader would silently drop it; declare ${REQUIRES_CAPABILITIES_FIELD}`,
      );
    }
  }

  checkUnknownToolUse(model.toolUse, path, errors);
}

/**
 * Unknown tool-call vocabulary check, shared by provider entries and fallbacks.
 *
 * `toolUse` is not a protocol-only field, so this must run on both surfaces: a
 * fallback carrying an unknown dialect leaks the same way a provider entry does.
 */
function checkUnknownToolUse(toolUse, path, errors) {
  if (!isPlainObject(toolUse)) return;

  const dialect = lower(toolUse.dialect);
  if (dialect && !LEGACY_V1_TOOL_DIALECTS.has(dialect)) {
    errors.push(
      `${path}.toolUse.dialect ${JSON.stringify(toolUse.dialect)} is not a v1-safe value `
        + `and a v1 reader would drop the whole tool contract; declare ${REQUIRES_CAPABILITIES_FIELD}`,
    );
  }

  const toolResultFormat = lower(toolUse.toolResultFormat);
  if (toolResultFormat && !LEGACY_V1_TOOL_RESULT_FORMATS.has(toolResultFormat)) {
    errors.push(
      `${path}.toolUse.toolResultFormat ${JSON.stringify(toolUse.toolResultFormat)} is not a v1-safe value `
        + `and a v1 reader would drop the whole tool contract; declare ${REQUIRES_CAPABILITIES_FIELD}`,
    );
  }
}

/**
 * A gated provider entry and its generic fallback must not disagree.
 *
 * Normalization covers the supported model-id aliases: an id may be reached
 * through a `-free` suffix, a `:route` suffix, a dotted Claude version, a
 * reverse-order Claude form (`claude-5.5-haiku`), a vendor namespaced
 * `anthropic/` prefix, or **any case spelling** (the lookup falls back to a
 * case-insensitive index). A fallback keyed by any of those forms resolves for
 * the same model, so deleting only the literal gated key from the v1 projection
 * would leave a reachable copy behind.
 *
 * The comparison is symmetric and case-folded: both ids are expanded to their
 * forms, lowercased, and matched on intersection, because either side can be
 * the decorated one (`anthropic/x` + `x`, `x` + `x-free`, `x` + `X`).
 *
 * The rule is a *requirement* comparison, not a deletion: the fallback may stay
 * in both artifacts, but it must declare at least the same capabilities as the
 * provider entry. A fallback that requires the same capability is projected out
 * of v1 alongside it; one that does not is a bypass and is rejected here.
 *
 * Only comparison keys are normalized — a request's model id is never rewritten.
 */
function canonicalAliasForms(modelId) {
  const forms = new Set();
  const add = (value) => {
    if (typeof value !== "string" || value.length === 0) return;
    forms.add(value.toLowerCase());
  };

  add(modelId);
  const bare = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : null;
  add(bare);

  for (const base of [modelId, bare]) {
    if (!base) continue;
    const colonIndex = base.indexOf(":");
    const noRoute = colonIndex >= 0 ? base.slice(0, colonIndex) : null;
    const noFree = base.endsWith("-free") ? base.slice(0, -"-free".length) : null;
    add(noRoute);
    add(noFree);
    if (noRoute) add(noRoute.endsWith("-free") ? noRoute.slice(0, -"-free".length) : null);
  }

  // Claude forms, as the client normalizes them: dotted versions folded to
  // hyphens, and the reverse-order `claude-<major>.<minor>-<family>` shape
  // rewritten to the official `<family>-<major>-<minor>` form.
  for (const form of [...forms]) {
    if (!/^claude-/.test(form)) continue;
    add(form.replace(/(\d)\.(\d)/g, "$1-$2"));
    const reverse = CLAUDE_REVERSE_ORDER.exec(form);
    if (reverse) add(`claude-${reverse[3]}-${reverse[1]}-${reverse[2]}`);
  }
  return forms;
}

function validateGateAliasCoverage(providers, fallbacks, errors) {
  if (!isPlainObject(providers) || !isPlainObject(fallbacks)) return;

  // Canonical alias form -> the gated entry (and its requirements) reachable at
  // that form. One gated model may be reachable under several forms; the
  // requirements are unioned so a fallback must satisfy all of them.
  const gatedByForm = new Map();
  for (const [provider, models] of Object.entries(providers)) {
    if (!isPlainObject(models)) continue;
    for (const [modelId, model] of Object.entries(models)) {
      const capabilities = declaredCapabilities(model);
      if (capabilities.length === 0) continue;
      for (const form of canonicalAliasForms(modelId)) {
        const existing = gatedByForm.get(form) || { provider, modelId, capabilities: new Set() };
        capabilities.forEach((id) => existing.capabilities.add(id));
        gatedByForm.set(form, existing);
      }
    }
  }
  if (gatedByForm.size === 0) return;

  for (const [fallbackId, fallback] of Object.entries(fallbacks)) {
    const hits = [];
    for (const form of canonicalAliasForms(fallbackId)) {
      const gate = gatedByForm.get(form);
      if (gate && !hits.includes(gate)) hits.push(gate);
    }
    if (hits.length === 0) continue;

    const fallbackCapabilities = new Set(declaredCapabilities(fallback));
    const missing = new Set();
    for (const gate of hits) {
      for (const id of gate.capabilities) {
        if (!fallbackCapabilities.has(id)) missing.add(id);
      }
    }
    if (missing.size === 0) continue;

    const targets = hits.map((g) => `providers.${g.provider}.${g.modelId}`).join(", ");
    errors.push(
      `fallbacks.${fallbackId} aliases the gated entry ${targets} `
        + `but does not declare ${JSON.stringify([...missing])}; a v1 reader resolving this fallback `
        + `would bypass the capability gate. Declare the same capabilities on the fallback.`,
    );
  }
}

function validateModelEntry(model, { allowProtocolFields, version }, path, errors) {
  if (!isPlainObject(model)) {
    errors.push(`${path} model entry must be a JSON object`);
    return;
  }

  const fields = version === 2 ? MODEL_FIELDS_V2 : MODEL_FIELDS_V1;
  for (const field of Object.keys(model)) {
    if (!fields.has(field)) {
      errors.push(`${path}.${field} is not a whitelisted model field`);
      continue;
    }
    if (!allowProtocolFields && PROTOCOL_ONLY_FIELDS.has(field)) {
      errors.push(`${path}.${field} is a protocol-level field and is not allowed in fallbacks`);
    }
  }

  if (model.name !== undefined && !isSafeString(model.name)) {
    errors.push(`${path}.name must be a non-URL string`);
  }
  if (model.context !== undefined && !isPositiveInteger(model.context)) {
    errors.push(`${path}.context must be a positive integer`);
  }
  if (model.maxContext !== undefined && !isPositiveInteger(model.maxContext)) {
    errors.push(`${path}.maxContext must be a positive integer`);
  }
  if (model.maxOutput !== undefined && model.maxOutput !== null && !isPositiveInteger(model.maxOutput)) {
    errors.push(`${path}.maxOutput must be a positive integer or null`);
  }
  for (const field of BOOLEAN_FIELDS) {
    if (model[field] !== undefined && typeof model[field] !== "boolean") {
      errors.push(`${path}.${field} must be boolean`);
    }
  }
  if (model.toolUse !== undefined) validateFlatObjectField("toolUse", model.toolUse, TOOL_USE_KEYS, path, errors);
  if (model.compat !== undefined) validateFlatObjectField("compat", model.compat, COMPAT_KEYS, path, errors);
  if (model.visionCapabilities !== undefined) {
    validateFlatObjectField("visionCapabilities", model.visionCapabilities, VISION_CAPABILITY_KEYS, path, errors);
  }
  if (model.thinkingLevelMap !== undefined) validateThinkingLevelMap(model.thinkingLevelMap, path, errors);
  if (model.quirks !== undefined) validateStringArray("quirks", model.quirks, path, errors);
  if (model.thinkingLevels !== undefined) validateStringArray("thinkingLevels", model.thinkingLevels, path, errors);
  if (model.serviceTiers !== undefined) validateServiceTiers(model.serviceTiers, path, errors);
  if (model.type !== undefined && !TYPE_ENUM.has(model.type)) {
    errors.push(`${path}.type has an unrecognized value: ${JSON.stringify(model.type)}`);
  }
  if (model.defaultThinkingLevel !== undefined && !DEFAULT_THINKING_LEVEL_ENUM.has(model.defaultThinkingLevel)) {
    errors.push(`${path}.defaultThinkingLevel has an unrecognized value: ${JSON.stringify(model.defaultThinkingLevel)}`);
  }
  if (model.api !== undefined && !API_ENUM.has(model.api)) {
    errors.push(`${path}.api has an unrecognized value: ${JSON.stringify(model.api)}`);
  }
  if (allowProtocolFields) checkXhighThinkingLevelAgreement(model, path, errors);

  if (version === 2) {
    if (model[REQUIRES_CAPABILITIES_FIELD] !== undefined) {
      validateRequiresCapabilities(model[REQUIRES_CAPABILITIES_FIELD], path, errors);
    }
    if (allowProtocolFields) {
      checkUnknownWireNeedsCapability(model, path, errors);
    } else if (declaredCapabilities(model).length === 0) {
      // fallbacks cannot carry compat (see PROTOCOL_ONLY_FIELDS), but toolUse is
      // allowed there, so an unknown dialect on a fallback must be gated too.
      checkUnknownToolUse(model.toolUse, path, errors);
    }
  }
}

// ---------------------------------------------------------------------------
// Curated default model lists (defaults.json).
//
// These cross-reference rules cannot be expressed in the JSON schema, so CI
// enforces them here: every default-list provider key must exist in
// providers/, every listed model id must exist in that provider's partition,
// and a listed model must not be an image-generation entry (type "image"),
// because the default list drives the chat model picker. An empty array is
// allowed and meaningful: it is an explicit "no curated defaults for this
// provider", distinct from the provider key being absent entirely.
// ---------------------------------------------------------------------------

export function validateDefaults(defaults, providers, errors) {
  if (!isPlainObject(defaults)) {
    errors.push("defaults must be a JSON object");
    return;
  }
  const providersKnown = isPlainObject(providers);
  for (const [provider, list] of Object.entries(defaults)) {
    if (!isValidIdentifierKey(provider)) {
      errors.push(`defaults has an invalid provider key: ${JSON.stringify(provider)}`);
    }
    if (!Array.isArray(list)) {
      errors.push(`defaults.${provider} must be an array of model ids`);
      continue;
    }
    const partition = providersKnown ? providers[provider] : undefined;
    if (providersKnown && !isPlainObject(partition)) {
      errors.push(`defaults.${provider} references a provider that is not in providers/`);
    }
    const seen = new Set();
    list.forEach((modelId, idx) => {
      const path = `defaults.${provider}[${idx}]`;
      if (typeof modelId !== "string" || modelId.length === 0 || !isSafeString(modelId)) {
        errors.push(`${path} must be a non-empty, non-URL model id string`);
        return;
      }
      if (seen.has(modelId)) {
        errors.push(`${path} duplicates model id ${JSON.stringify(modelId)}`);
        return;
      }
      seen.add(modelId);
      if (!isPlainObject(partition)) return; // missing provider already reported
      const entry = partition[modelId];
      if (!isPlainObject(entry)) {
        errors.push(`${path} references ${JSON.stringify(modelId)}, which is not in providers.${provider}`);
        return;
      }
      if (entry.type === "image") {
        errors.push(
          `${path} references ${JSON.stringify(modelId)}, an image model (type "image"), `
            + "which cannot be a default chat model",
        );
      }
    });
  }
}

/**
 * Validate the providers/fallbacks/defaults payload shared by both
 * source-tree and compiled-artifact validation. Returns a (possibly empty)
 * array of error strings; never throws.
 *
 * `defaults` defaults to an empty object so callers that only exercise the
 * providers/fallbacks rules do not have to synthesize a curated list; the
 * source-tree loader always passes the value parsed from defaults.json.
 */
export function validateCatalogData(providers, fallbacks, defaults = {}, { version = 1 } = {}) {
  const errors = [];

  if (!isPlainObject(providers)) {
    errors.push("providers must be a JSON object");
  } else {
    for (const [provider, models] of Object.entries(providers)) {
      if (!isValidIdentifierKey(provider)) {
        errors.push(`providers has an invalid provider key: ${JSON.stringify(provider)}`);
      }
      if (!isPlainObject(models)) {
        errors.push(`providers.${provider} must be a JSON object`);
        continue;
      }
      for (const [modelId, model] of Object.entries(models)) {
        if (!isValidIdentifierKey(modelId)) {
          errors.push(`providers.${provider} has an invalid model id: ${JSON.stringify(modelId)}`);
        }
        validateModelEntry(
          model,
          { allowProtocolFields: true, version },
          `providers.${provider}.${modelId}`,
          errors,
        );
      }
    }
  }

  if (!isPlainObject(fallbacks)) {
    errors.push("fallbacks must be a JSON object");
  } else {
    for (const [modelId, model] of Object.entries(fallbacks)) {
      if (!isValidIdentifierKey(modelId)) {
        errors.push(`fallbacks has an invalid model id: ${JSON.stringify(modelId)}`);
      }
      validateModelEntry(model, { allowProtocolFields: false, version }, `fallbacks.${modelId}`, errors);
    }
  }

  if (isPlainObject(providers)) scanTreeForForbiddenContent(providers, "providers", errors);
  if (isPlainObject(fallbacks)) scanTreeForForbiddenContent(fallbacks, "fallbacks", errors);
  if (isPlainObject(defaults)) scanTreeForForbiddenContent(defaults, "defaults", errors);

  validateDefaults(defaults, providers, errors);
  if (version === 2) validateGateAliasCoverage(providers, fallbacks, errors);

  return errors;
}

// ---------------------------------------------------------------------------
// v1 projection: deterministic, gate-aware downgrade of the v2 data.
//
// The v1 artifact is a *degraded view* for readers that predate capability
// gating, not a second curation. It is derived from the same source tree by
// pure removal:
//
//   1. every provider entry that declares capabilities is dropped;
//   2. every provider partition is kept even if that empties it (deleting the
//      key would hand discovery to a different client branch);
//   3. every gated id is filtered out of `defaults`, with the provider key kept
//      (an empty array is the explicit "no curated defaults" marker; dropping
//      the key instead would restore the client's own default list);
//   4. every fallback that declares capabilities is dropped, which — together
//      with validateGateAliasCoverage — removes the reachable copies an alias
//      lookup could otherwise resolve to;
//   5. no other entry is touched: fields are never rewritten, downgraded or
//      compensated.
//
// A gated entry therefore does not exist in v1 at all, rather than existing
// with its requirement stripped.
// ---------------------------------------------------------------------------

export function projectV1FromV2(providers, fallbacks, defaults = {}) {
  const v1Providers = {};
  for (const [provider, models] of Object.entries(providers || {})) {
    if (!isPlainObject(models)) {
      v1Providers[provider] = models;
      continue;
    }
    const kept = {};
    for (const [modelId, model] of Object.entries(models)) {
      if (declaredCapabilities(model).length > 0) continue;
      kept[modelId] = model;
    }
    v1Providers[provider] = kept;
  }

  const v1Fallbacks = {};
  for (const [modelId, model] of Object.entries(fallbacks || {})) {
    if (declaredCapabilities(model).length > 0) continue;
    v1Fallbacks[modelId] = model;
  }

  const v1Defaults = {};
  for (const [provider, list] of Object.entries(defaults || {})) {
    if (!Array.isArray(list)) {
      v1Defaults[provider] = list;
      continue;
    }
    v1Defaults[provider] = list.filter((modelId) => {
      const partition = v1Providers[provider];
      return isPlainObject(partition) && isPlainObject(partition[modelId]);
    });
  }

  return { providers: v1Providers, fallbacks: v1Fallbacks, defaults: v1Defaults };
}

// ---------------------------------------------------------------------------
// CI-only content scan: credential material and executable/network
// instruction indicators. These are additional to the application's runtime
// validator — the app trusts the field whitelist as its primary defense,
// but repository CI carries extra teeth before anything is ever published.
// ---------------------------------------------------------------------------

const CREDENTIAL_PATTERNS = [
  { name: "OpenAI-style secret key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "PEM private key block", re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { name: "bearer token", re: /\bBearer\s+[A-Za-z0-9\-_.]{10,}/i },
  { name: "authorization header", re: /\bAuthorization\s*:\s*\S+/i },
  { name: "cookie header", re: /\b(Cookie|Set-Cookie)\s*:\s*\S+/i },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
];

const EXECUTABLE_PATTERNS = [
  { name: "shell command substitution", re: /\$\([^)]*\)/ },
  { name: "backtick shell substitution", re: /`[^`]+`/ },
  { name: "dynamic require/import call", re: /\b(require|import)\s*\(/ },
  { name: "eval call", re: /\beval\s*\(/ },
  { name: "child_process reference", re: /child_process/ },
  { name: "exec call", re: /\bexec(Sync)?\s*\(/ },
  { name: "script tag", re: /<script\b/i },
  { name: "shell command keyword", re: /\b(curl|wget|rm\s+-rf|sudo|chmod\s+\+x|bash\s+-c|sh\s+-c|powershell)\b/i },
];

function scanStringForForbiddenContent(str, path, errors) {
  if (URL_LIKE.test(str)) {
    errors.push(`${path}: value looks like a URL, which is forbidden in this catalog: ${JSON.stringify(str.slice(0, 80))}`);
  }
  for (const { name, re } of CREDENTIAL_PATTERNS) {
    if (re.test(str)) {
      errors.push(`${path}: value matches a credential-material pattern (${name}) and is forbidden`);
    }
  }
  for (const { name, re } of EXECUTABLE_PATTERNS) {
    if (re.test(str)) {
      errors.push(`${path}: value matches an executable/network-instruction pattern (${name}) and is forbidden`);
    }
  }
}

function scanTreeForForbiddenContent(node, path, errors) {
  if (typeof node === "string") {
    scanStringForForbiddenContent(node, path, errors);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, idx) => scanTreeForForbiddenContent(v, `${path}[${idx}]`, errors));
    return;
  }
  if (isPlainObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      scanStringForForbiddenContent(k, `${path}.<key ${JSON.stringify(k)}>`, errors);
      scanTreeForForbiddenContent(v, `${path}.${k}`, errors);
    }
  }
}

// ---------------------------------------------------------------------------
// Source-tree loading: providers/*.json + fallbacks.json.
// ---------------------------------------------------------------------------

/**
 * Pure, disk-independent check for duplicate provider identity across a list
 * of provider filenames: a case-insensitive collision (e.g. "openai.json"
 * and "OpenAI.json") would silently diverge between a case-insensitive
 * contributor filesystem (where the second write clobbers the first, so the
 * problem is invisible locally) and a case-sensitive CI runner (where both
 * files exist and the provider key is ambiguous). Returns an array of error
 * strings; empty when every filename's lowercased basename is unique.
 */
export function detectCaseInsensitiveCollisions(filenames) {
  const errors = [];
  const seenLower = new Map();
  for (const file of filenames) {
    const key = basename(file, ".json");
    const lower = key.toLowerCase();
    if (seenLower.has(lower)) {
      errors.push(
        `providers/${file}: provider key ${JSON.stringify(key)} collides case-insensitively with `
          + `providers/${seenLower.get(lower)} (duplicate provider identity)`,
      );
    } else {
      seenLower.set(lower, file);
    }
  }
  return errors;
}

/**
 * Load and structurally admit the source tree (providers/*.json,
 * fallbacks.json, defaults.json) under rootDir. Detects duplicate provider
 * identities (including a case-insensitive filename collision — see
 * detectCaseInsensitiveCollisions) and duplicate keys at every JSON nesting
 * level.
 *
 * Returns { providers, fallbacks, defaults, loadErrors }. providers/
 * fallbacks/defaults are best effort — a file that failed to parse is simply
 * omitted from them (a missing or malformed defaults.json is a hard
 * loadError, never a silent empty default list) — so callers should treat a
 * non-empty loadErrors as fatal before trusting the returned data.
 */
export function loadSourceCatalog(rootDir) {
  const loadErrors = [];
  const providersDir = join(rootDir, "providers");
  const fallbacksPath = join(rootDir, "fallbacks.json");
  const defaultsPath = join(rootDir, "defaults.json");
  const providers = {};

  let files = [];
  try {
    files = readdirSync(providersDir).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    loadErrors.push(`providers/: cannot read directory (${err.message})`);
  }

  loadErrors.push(...detectCaseInsensitiveCollisions(files));

  for (const file of files) {
    const key = basename(file, ".json");
    if (!isValidIdentifierKey(key)) {
      loadErrors.push(`providers/${file}: invalid provider key ${JSON.stringify(key)}`);
      continue;
    }
    let text;
    try {
      text = readFileSync(join(providersDir, file), "utf8");
    } catch (err) {
      loadErrors.push(`providers/${file}: cannot read file (${err.message})`);
      continue;
    }
    let parsed;
    try {
      parsed = parseJsonStrict(text, `providers/${file}`);
    } catch (err) {
      loadErrors.push(err.message);
      continue;
    }
    if (!isPlainObject(parsed)) {
      loadErrors.push(`providers/${file}: top-level value must be a JSON object`);
      continue;
    }
    providers[key] = parsed;
  }

  let fallbacks = {};
  try {
    const text = readFileSync(fallbacksPath, "utf8");
    const parsed = parseJsonStrict(text, "fallbacks.json");
    if (!isPlainObject(parsed)) {
      loadErrors.push("fallbacks.json: top-level value must be a JSON object");
    } else {
      fallbacks = parsed;
    }
  } catch (err) {
    loadErrors.push(err instanceof CatalogValidationError ? err.message : `fallbacks.json: cannot read/parse (${err.message})`);
  }

  let defaults = {};
  try {
    const text = readFileSync(defaultsPath, "utf8");
    const parsed = parseJsonStrict(text, "defaults.json");
    if (!isPlainObject(parsed)) {
      loadErrors.push("defaults.json: top-level value must be a JSON object");
    } else {
      defaults = parsed;
    }
  } catch (err) {
    loadErrors.push(err instanceof CatalogValidationError ? err.message : `defaults.json: cannot read/parse (${err.message})`);
  }

  return { providers, fallbacks, defaults, loadErrors };
}

/** Validate the source tree end to end. Returns an array of error strings. */
export function validateSource(rootDir) {
  const { providers, fallbacks, defaults, loadErrors } = loadSourceCatalog(rootDir);
  if (loadErrors.length > 0) return loadErrors;
  // The source tree is always authored as the v2 superset; the v1 artifact is a
  // projection of it (see projectV1FromV2), never authored directly.
  return validateCatalogData(providers, fallbacks, defaults, { version: 2 });
}

// ---------------------------------------------------------------------------
// Compiled-artifact validation: full model-catalog.v1.json envelope.
// ---------------------------------------------------------------------------

const ALLOWED_TOP_LEVEL_KEYS = Object.freeze(["schemaVersion", "publishedAt", "providers", "fallbacks", "defaults"]);
const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2]);

// Strict ISO 8601 UTC timestamp: date, "T", time, optional fractional
// seconds, "Z". This is deliberately narrower than "anything Date.parse
// accepts" (which would also admit a non-UTC offset like "+08:00", or a
// bare date with no time component) — publishedAt is a build-stamped value
// compared across builds and providers must be able to reason about it
// without a timezone table.
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** True iff value is a string in strict ISO 8601 UTC form and names a real calendar instant. */
export function isValidIso8601Utc(value) {
  return typeof value === "string" && ISO_8601_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

/** Validate only the top-level envelope of a compiled artifact document. */
export function validateArtifactShape(raw) {
  const errors = [];
  if (!isPlainObject(raw)) {
    errors.push("model catalog must be a JSON object");
    return errors;
  }

  const allowed = new Set(ALLOWED_TOP_LEVEL_KEYS);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) errors.push(`unknown top-level model catalog key: ${key}`);
  }
  for (const key of ALLOWED_TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      errors.push(`model catalog is missing required top-level key: ${key}`);
    }
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    errors.push(`unsupported model catalog schemaVersion: ${JSON.stringify(raw.schemaVersion)}`);
  }
  if (!isValidIso8601Utc(raw.publishedAt)) {
    errors.push("publishedAt must be a valid ISO 8601 UTC timestamp");
  }

  return errors;
}

/** Validate a full compiled artifact document (envelope + data). */
export function validateArtifact(raw, { version } = {}) {
  const errors = validateArtifactShape(raw);

  // The data rules follow the document's own schemaVersion, so a v1 artifact is
  // held to the frozen v1 rules and a v2 artifact to the v2 rules.
  const declared = isPlainObject(raw) ? raw.schemaVersion : undefined;

  // An explicit expectation is a cross-check, not an override: a caller that
  // says "this is the v1 file" must not have a v2 document waved through under
  // v1 field rules (or the reverse). Both a labelled-wrong file and a file whose
  // envelope lies about its generation are rejected here.
  if (version !== undefined) {
    if (declared !== version) {
      errors.push(
        `artifact declares schemaVersion ${JSON.stringify(declared)}, but ${version} was required`,
      );
      return errors;
    }
  }

  if (isPlainObject(raw) && isPlainObject(raw.providers) && isPlainObject(raw.fallbacks)) {
    errors.push(...validateCatalogData(raw.providers, raw.fallbacks, raw.defaults, { version: declared }));
  }
  return errors;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function runCli(argv) {
  let mode = "source";
  let sourceDir = repoRoot();
  const artifactPaths = [];
  let expectedVersion;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") {
      mode = "source";
      sourceDir = argv[++i];
    } else if (a === "--artifact") {
      mode = "artifact";
      artifactPaths.push(argv[++i]);
    } else if (a === "--expect-version") {
      expectedVersion = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/validate-catalog.mjs [--source <dir>] [--artifact <file> ...] [--expect-version <n>]\n"
          + "  --source <dir>        validate providers/*.json + fallbacks.json + defaults.json under <dir> (default: repo root)\n"
          + "  --artifact <file>     validate a compiled artifact; may be repeated to check several in one run\n"
          + "  --expect-version <n>  require each --artifact to declare this schemaVersion",
      );
      return 0;
    } else {
      console.error(`validate-catalog: unrecognized argument: ${a}`);
      return 2;
    }
  }

  let errors;
  let label;
  if (mode === "artifact") {
    errors = [];
    const labels = [];
    for (const artifactPath of artifactPaths) {
      const artifactLabel = `artifact ${artifactPath}`;
      labels.push(artifactLabel);
      let doc;
      try {
        doc = parseJsonStrict(readFileSync(artifactPath, "utf8"), artifactPath);
      } catch (err) {
        errors.push(`${artifactLabel}: ${err.message}`);
        continue;
      }
      if (expectedVersion !== undefined && isPlainObject(doc) && doc.schemaVersion !== expectedVersion) {
        errors.push(
          `${artifactLabel} declares schemaVersion ${JSON.stringify(doc.schemaVersion)}, `
            + `but ${expectedVersion} was required`,
        );
        continue;
      }
      errors.push(...validateArtifact(doc).map((e) => `${artifactLabel}: ${e}`));
    }
    label = labels.join(" + ") || "artifact (none given)";
  } else {
    label = `source tree ${sourceDir}`;
    errors = validateSource(sourceDir);
  }

  if (errors.length > 0) {
    console.error(`validate-catalog: ${label} FAILED with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }

  console.log(`validate-catalog: ${label} OK`);
  return 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exit(runCli(process.argv.slice(2)));
}
