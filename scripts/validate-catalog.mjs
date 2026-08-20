#!/usr/bin/env node
// scripts/validate-catalog.mjs
//
// Validator for the hana-model-catalog source tree (providers/*.json +
// fallbacks.json) and for a compiled model-catalog.v1.json artifact.
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

function isValidIdentifierKey(key) {
  return typeof key === "string" && key.length > 0 && key.trim().length > 0 && !key.startsWith("_");
}

function isSafeString(value) {
  return typeof value === "string" && !URL_LIKE.test(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

// 20-field whitelist. One more field than this and the entry is rejected.
const MODEL_FIELDS = new Set([
  "name", "context", "maxContext", "maxOutput", "image", "video", "audio",
  "reasoning", "toolUse", "type", "api", "compat", "quirks", "thinkingLevels",
  "thinkingLevelMap", "defaultThinkingLevel", "visionCapabilities", "xhigh",
  "legacyCompatibility", "serviceTiers",
]);

// Protocol-level fields are forbidden on fallback entries: an unknown/custom
// provider must never implicitly inherit another provider's wire contract
// from the generic fallback baseline.
const PROTOCOL_ONLY_FIELDS = new Set([
  "api", "compat", "thinkingLevels", "thinkingLevelMap", "defaultThinkingLevel",
  "legacyCompatibility", "maxContext", "serviceTiers",
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

function validateModelEntry(model, { allowProtocolFields }, path, errors) {
  if (!isPlainObject(model)) {
    errors.push(`${path} model entry must be a JSON object`);
    return;
  }

  for (const field of Object.keys(model)) {
    if (!MODEL_FIELDS.has(field)) {
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
}

/**
 * Validate the providers/fallbacks payload shared by both source-tree and
 * compiled-artifact validation. Returns a (possibly empty) array of error
 * strings; never throws.
 */
export function validateCatalogData(providers, fallbacks) {
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
        validateModelEntry(model, { allowProtocolFields: true }, `providers.${provider}.${modelId}`, errors);
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
      validateModelEntry(model, { allowProtocolFields: false }, `fallbacks.${modelId}`, errors);
    }
  }

  if (isPlainObject(providers)) scanTreeForForbiddenContent(providers, "providers", errors);
  if (isPlainObject(fallbacks)) scanTreeForForbiddenContent(fallbacks, "fallbacks", errors);

  return errors;
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
 * Load and structurally admit the source tree (providers/*.json +
 * fallbacks.json) under rootDir. Detects duplicate provider identities
 * (including a case-insensitive filename collision — see
 * detectCaseInsensitiveCollisions) and duplicate keys at every JSON nesting
 * level.
 *
 * Returns { providers, fallbacks, loadErrors }. providers/fallbacks are best
 * effort — a file that failed to parse is simply omitted from them — so
 * callers should treat a non-empty loadErrors as fatal before trusting the
 * returned data.
 */
export function loadSourceCatalog(rootDir) {
  const loadErrors = [];
  const providersDir = join(rootDir, "providers");
  const fallbacksPath = join(rootDir, "fallbacks.json");
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

  return { providers, fallbacks, loadErrors };
}

/** Validate the source tree end to end. Returns an array of error strings. */
export function validateSource(rootDir) {
  const { providers, fallbacks, loadErrors } = loadSourceCatalog(rootDir);
  if (loadErrors.length > 0) return loadErrors;
  return validateCatalogData(providers, fallbacks);
}

// ---------------------------------------------------------------------------
// Compiled-artifact validation: full model-catalog.v1.json envelope.
// ---------------------------------------------------------------------------

const ALLOWED_TOP_LEVEL_KEYS = Object.freeze(["schemaVersion", "publishedAt", "providers", "fallbacks"]);
const SUPPORTED_SCHEMA_VERSION = 1;

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

  if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    errors.push(`unsupported model catalog schemaVersion: ${JSON.stringify(raw.schemaVersion)}`);
  }
  if (!isValidIso8601Utc(raw.publishedAt)) {
    errors.push("publishedAt must be a valid ISO 8601 UTC timestamp");
  }

  return errors;
}

/** Validate a full compiled artifact document (envelope + data). */
export function validateArtifact(raw) {
  const errors = validateArtifactShape(raw);
  if (isPlainObject(raw) && isPlainObject(raw.providers) && isPlainObject(raw.fallbacks)) {
    errors.push(...validateCatalogData(raw.providers, raw.fallbacks));
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
  let artifactPath = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") {
      mode = "source";
      sourceDir = argv[++i];
    } else if (a === "--artifact") {
      mode = "artifact";
      artifactPath = argv[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/validate-catalog.mjs [--source <dir>] [--artifact <file>]\n"
          + "  --source <dir>     validate providers/*.json + fallbacks.json under <dir> (default: repo root)\n"
          + "  --artifact <file>  validate a compiled model-catalog.v1.json artifact",
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
    label = `artifact ${artifactPath}`;
    let doc;
    try {
      doc = parseJsonStrict(readFileSync(artifactPath, "utf8"), artifactPath);
    } catch (err) {
      console.error(`validate-catalog: ${err.message}`);
      return 1;
    }
    errors = validateArtifact(doc);
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
