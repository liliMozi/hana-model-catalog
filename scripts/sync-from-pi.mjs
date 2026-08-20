#!/usr/bin/env node
// scripts/sync-from-pi.mjs
//
// Reconciles this repository's providers/*.json + fallbacks.json against the
// model catalog bundled inside the "pi-ai" npm package (which itself derives
// from models.dev). This is an intersection-only diff tool: it never
// introduces a model that doesn't already exist in this repository's source
// tree, and it never touches any field outside the fixed whitelist below.
//
// Behavior:
//   - Provider-scoped pass: for every (provider, modelId) pair already
//     present in providers/*.json, look up the same provider key and model
//     id in the upstream catalog. The provider key is compared literally —
//     no fuzzy or aliased matching.
//   - Fallback-scoped pass: fallbacks.json has no provider dimension (a
//     fallback entry is keyed by model id alone, for callers that don't
//     resolve a specific provider). To reconcile it against a
//     provider-keyed upstream catalog, this tool searches every upstream
//     provider bucket for the model id. If exactly one upstream provider
//     carries that model id (or every provider that does agrees on a
//     field's value), that value is used. If upstream providers disagree
//     with each other on a field's value for the same model id, the model
//     id is reported as ambiguous and left untouched — this tool never
//     guesses which upstream provider's number is authoritative.
//   - Field whitelist (only these four are ever read or written):
//       upstream.contextWindow      -> context
//       upstream.maxTokens          -> maxOutput
//       upstream.input includes "image" -> image   (missing locally defaults to false)
//       upstream.reasoning === true -> reasoning    (missing locally defaults to false)
//   - Explicitly out of scope: introducing new models from upstream; adding,
//     renaming or removing any field outside the whitelist above (compat,
//     quirks, toolUse, visionCapabilities, xhigh, api, name, ...); adding
//     cost/pricing data.
//   - An upstream numeric value is only ever proposed as an update if it is
//     a positive integer; a malformed upstream value (zero, negative,
//     non-integer) is treated the same as absent data and never applied,
//     since applying it would fail this repository's own schema validator.
//   - Default mode is dry-run: prints a summary of what would change and
//     writes nothing. Pass --write to apply. After a successful write, this
//     tool re-runs this repository's own source-tree validator
//     (validate-catalog.mjs) before exiting, so a write that produced an
//     invalid catalog is caught immediately rather than left for CI to
//     discover later.
//   - Write strategy: each touched provider file, and fallbacks.json if
//     touched, is fully re-parsed, patched in memory, and re-serialized with
//     JSON.stringify(obj, null, 2) plus a trailing newline. This matches the
//     exact on-disk formatting already used throughout this repository (see
//     tests/build-reconstruction.test.mjs), so an untouched file is never
//     rewritten and a run with zero applicable diffs leaves the tree
//     byte-identical. Object key order is JavaScript's own insertion order:
//     untouched keys keep their existing position, and a field added to a
//     model that didn't have it yet is appended at the end of that model's
//     object, exactly where the original hand-authored file would put a new
//     field.
//
// This repository has no node_modules and adds no npm dependency to read
// the upstream catalog: the path to the pi-ai package's model-catalog
// directory is a required CLI argument, and it is loaded as a native ES
// module (the generated file's own export), the same way it has always been
// consumed. There is no default or guessed location for it.
//
// Zero runtime dependencies beyond this repository's own validate-catalog.mjs
// module. Node >= 18.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateSource } from "./validate-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Filename of the generated catalog module inside the pi-ai package's
// model-catalog directory. This is the one concrete filename this tool
// knows how to read; if it isn't found under --pi-dist, the tool fails
// rather than searching the directory for a plausible alternative.
const PI_MODELS_FILENAME = "models.generated.js";

// ---------------------------------------------------------------------------
// Field whitelist
// ---------------------------------------------------------------------------

const FIELD_MAP = [
  {
    key: "context",
    read: (entry) => entry.contextWindow,
    isValidValue: (v) => Number.isInteger(v) && v > 0,
    localDefault: undefined,
  },
  {
    key: "maxOutput",
    read: (entry) => entry.maxTokens,
    isValidValue: (v) => Number.isInteger(v) && v > 0,
    localDefault: undefined,
  },
  {
    key: "image",
    read: (entry) => Array.isArray(entry.input) && entry.input.includes("image"),
    isValidValue: (v) => typeof v === "boolean",
    localDefault: false,
  },
  {
    key: "reasoning",
    read: (entry) => entry.reasoning === true,
    isValidValue: (v) => typeof v === "boolean",
    localDefault: false,
  },
];

// ---------------------------------------------------------------------------
// Explicit exclusions: (provider, modelId, field) triples where the
// upstream catalog's value is known to disagree with the value curated here
// for a specific, documented reason. A match keeps the current authored
// value; the disagreement is still reported (in a separate section) but is
// never applied by --write.
//
// Keys use the same "provider/modelId.field" shape as a diff report line.
//
// - anthropic/claude-opus-4-6.context, anthropic/claude-sonnet-4-6.context:
//   the upstream entry reflects an extended-context beta profile; the value
//   curated here uses the generally-available context size instead, to
//   avoid computing this model's context-compaction thresholds against a
//   ceiling most callers do not actually have enabled.
// - mistral/codestral-latest.maxOutput and every openrouter/*.maxOutput
//   entry below: the upstream source's default output ceiling for these
//   entries is a conservative fallback value (commonly 4096) that would
//   silently truncate legitimate longer completions; the values curated
//   here reflect the providers' documented output limits instead.
// - mistral/mistral-small-latest.reasoning and the three
//   xai/grok-code-fast-1.* entries: the upstream value disagrees with the
//   value curated here in a direction that has not been independently
//   confirmed against the provider's own documentation; kept at the
//   curated value pending confirmation.
// - minimax/MiniMax-M3.context: the curated value reflects an observed
//   practical usability ceiling below the vendor's advertised maximum
//   context size; kept in preference to the larger upstream figure.
const EXCLUDED_UPDATES = new Set([
  "minimax/MiniMax-M3.context",
  "anthropic/claude-opus-4-6.context",
  "anthropic/claude-sonnet-4-6.context",
  "mistral/codestral-latest.maxOutput",
  "mistral/mistral-small-latest.reasoning",
  "xai/grok-code-fast-1.context",
  "xai/grok-code-fast-1.maxOutput",
  "xai/grok-code-fast-1.reasoning",
  "openrouter/mistralai/devstral-2512.maxOutput",
  "openrouter/mistralai/ministral-3b-2512.maxOutput",
  "openrouter/mistralai/ministral-8b-2512.maxOutput",
  "openrouter/mistralai/ministral-14b-2512.maxOutput",
  "openrouter/mistralai/mistral-large-2512.maxOutput",
  "openrouter/moonshotai/kimi-k2.5.maxOutput",
  "openrouter/openai/gpt-4.1.maxOutput",
  "openrouter/openai/gpt-5-nano.maxOutput",
  "openrouter/openai/gpt-oss-20b.maxOutput",
  "openrouter/qwen/qwen3-235b-a22b-thinking-2507.maxOutput",
  "openrouter/qwen/qwen3.5-397b-a17b.maxOutput",
  "openrouter/z-ai/glm-5.maxOutput",
]);

// The fallback-scoped pass has no provider prefix to match against
// (fallbacks.json is keyed by model id alone). Deriving a provider-agnostic
// "modelId.field" key from each provider-scoped exclusion above — by
// stripping the leading "provider/" segment — means a field that's been
// deliberately excluded for one provider's entry is also excluded for a
// fallback entry sharing that exact model id, without hand-duplicating the
// table. Provider keys never contain "/", so splitting on the first "/" is
// exact.
function bareExclusionKey(scopedKey) {
  return scopedKey.slice(scopedKey.indexOf("/") + 1);
}
const EXCLUDED_BARE_KEYS = new Set([...EXCLUDED_UPDATES].map(bareExclusionKey));

// ---------------------------------------------------------------------------
// --pi-dist resolution
// ---------------------------------------------------------------------------

/**
 * Validate --pi-dist and return the absolute path to its models.generated.js.
 * Throws a descriptive Error (with .exitCode = 2) on a missing argument, a
 * path that doesn't exist or isn't a directory, or a directory that doesn't
 * contain the one filename this tool knows how to read. Never guesses a
 * default or alternate location.
 */
export function resolvePiDist(piDistArg, cwd = process.cwd()) {
  if (!piDistArg) {
    const err = new Error(
      "missing required --pi-dist <path> argument: the path to the pi-ai "
        + `package's model-catalog directory (the one containing ${PI_MODELS_FILENAME})`,
    );
    err.exitCode = 2;
    throw err;
  }
  const resolved = resolve(cwd, piDistArg);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    const err = new Error(`--pi-dist path does not exist or is not a directory: ${resolved}`);
    err.exitCode = 2;
    throw err;
  }
  const modelsFile = join(resolved, PI_MODELS_FILENAME);
  if (!existsSync(modelsFile)) {
    const err = new Error(
      `--pi-dist directory does not contain ${PI_MODELS_FILENAME}: ${resolved}\n`
        + `  expected file not found; this tool does not search for or guess an alternate filename`,
    );
    err.exitCode = 2;
    throw err;
  }
  return modelsFile;
}

/** Load the upstream MODELS object by importing the generated module directly. */
export async function loadPiModels(piDistArg, cwd = process.cwd()) {
  const modelsFile = resolvePiDist(piDistArg, cwd);
  const mod = await import(pathToFileURL(modelsFile).href);
  if (!mod || typeof mod.MODELS !== "object" || mod.MODELS === null) {
    const err = new Error(`${modelsFile} does not export a "MODELS" object`);
    err.exitCode = 2;
    throw err;
  }
  return mod.MODELS;
}

// ---------------------------------------------------------------------------
// Source tree loading (full parse, for in-memory patch + full rewrite)
// ---------------------------------------------------------------------------

function loadProviderFiles(repoRoot) {
  const providersDir = join(repoRoot, "providers");
  const files = readdirSync(providersDir).filter((f) => f.endsWith(".json")).sort();
  const byProvider = new Map();
  for (const file of files) {
    const provider = basename(file, ".json");
    const filePath = join(providersDir, file);
    const models = JSON.parse(readFileSync(filePath, "utf8"));
    byProvider.set(provider, { filePath, models });
  }
  return byProvider;
}

function loadFallbacksFile(repoRoot) {
  const filePath = join(repoRoot, "fallbacks.json");
  const models = JSON.parse(readFileSync(filePath, "utf8"));
  return { filePath, models };
}

function buildPiModelIdIndex(MODELS) {
  const index = new Map(); // modelId -> [{ provider, entry }]
  for (const [provider, models] of Object.entries(MODELS)) {
    if (typeof models !== "object" || models === null) continue;
    for (const [modelId, entry] of Object.entries(models)) {
      if (!index.has(modelId)) index.set(modelId, []);
      index.get(modelId).push({ provider, entry });
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Plan computation (pure — no filesystem writes)
// ---------------------------------------------------------------------------

/**
 * Compute the full diff plan against an already-loaded upstream MODELS
 * object. repoRoot's source tree is read but not modified.
 */
export function computeSyncPlan(repoRoot, MODELS) {
  const providerFiles = loadProviderFiles(repoRoot);
  const fallbacksFile = loadFallbacksFile(repoRoot);
  const piIndex = buildPiModelIdIndex(MODELS);

  const providerDiffs = [];
  const providerExcluded = [];
  const providerMissing = [];

  for (const [provider, { models }] of providerFiles) {
    for (const [modelId, hanaEntry] of Object.entries(models)) {
      const piEntry = MODELS?.[provider]?.[modelId];
      if (!piEntry) {
        providerMissing.push(`${provider}/${modelId}`);
        continue;
      }
      for (const field of FIELD_MAP) {
        const piValue = field.read(piEntry);
        if (piValue === undefined || piValue === null) continue;
        if (!field.isValidValue(piValue)) continue;
        const hanaValue = Object.prototype.hasOwnProperty.call(hanaEntry, field.key)
          ? hanaEntry[field.key]
          : field.localDefault;
        if (hanaValue === piValue) continue;
        const entry = { provider, modelId, field: field.key, oldValue: hanaValue, newValue: piValue };
        if (EXCLUDED_UPDATES.has(`${provider}/${modelId}.${field.key}`)) providerExcluded.push(entry);
        else providerDiffs.push(entry);
      }
    }
  }

  const fallbackDiffs = [];
  const fallbackExcluded = [];
  const fallbackAmbiguous = [];
  const fallbackMissing = [];

  for (const [modelId, hanaEntry] of Object.entries(fallbacksFile.models)) {
    const matches = piIndex.get(modelId) || [];
    if (matches.length === 0) {
      fallbackMissing.push(modelId);
      continue;
    }
    for (const field of FIELD_MAP) {
      const candidates = [];
      for (const { provider, entry: piEntry } of matches) {
        const v = field.read(piEntry);
        if (v === undefined || v === null) continue;
        if (!field.isValidValue(v)) continue;
        candidates.push({ provider, value: v });
      }
      if (candidates.length === 0) continue;
      const uniqueValues = [...new Set(candidates.map((c) => c.value))];
      if (uniqueValues.length > 1) {
        fallbackAmbiguous.push({ modelId, field: field.key, candidates });
        continue;
      }
      const piValue = uniqueValues[0];
      const hanaValue = Object.prototype.hasOwnProperty.call(hanaEntry, field.key)
        ? hanaEntry[field.key]
        : field.localDefault;
      if (hanaValue === piValue) continue;
      const entry = { modelId, field: field.key, oldValue: hanaValue, newValue: piValue };
      if (EXCLUDED_BARE_KEYS.has(`${modelId}.${field.key}`)) fallbackExcluded.push(entry);
      else fallbackDiffs.push(entry);
    }
  }

  return {
    providerFiles,
    fallbacksFile,
    providerDiffs,
    providerExcluded,
    providerMissing,
    fallbackDiffs,
    fallbackExcluded,
    fallbackAmbiguous,
    fallbackMissing,
  };
}

// ---------------------------------------------------------------------------
// Apply (writes) — full re-serialization of every touched file
// ---------------------------------------------------------------------------

/** Apply plan.providerDiffs and plan.fallbackDiffs to disk. Returns touched file paths. */
export function applyPlan(plan) {
  const touched = [];

  const diffsByProvider = new Map();
  for (const d of plan.providerDiffs) {
    if (!diffsByProvider.has(d.provider)) diffsByProvider.set(d.provider, []);
    diffsByProvider.get(d.provider).push(d);
  }
  for (const [provider, diffs] of diffsByProvider) {
    const { filePath, models } = plan.providerFiles.get(provider);
    for (const d of diffs) models[d.modelId][d.field] = d.newValue;
    writeFileSync(filePath, `${JSON.stringify(models, null, 2)}\n`, "utf8");
    touched.push(filePath);
  }

  if (plan.fallbackDiffs.length > 0) {
    const { filePath, models } = plan.fallbacksFile;
    for (const d of plan.fallbackDiffs) models[d.modelId][d.field] = d.newValue;
    writeFileSync(filePath, `${JSON.stringify(models, null, 2)}\n`, "utf8");
    touched.push(filePath);
  }

  return touched;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function fmt(value) {
  return value === undefined ? "(unset)" : JSON.stringify(value);
}

export function formatReport(plan, { write } = { write: false }) {
  const lines = [];

  lines.push("=== Field differences: providers/*.json ===");
  if (plan.providerDiffs.length === 0) {
    lines.push("(none)");
  } else {
    for (const d of plan.providerDiffs) {
      lines.push(`${d.provider}/${d.modelId}.${d.field}: ${fmt(d.oldValue)} -> ${fmt(d.newValue)}`);
    }
  }

  lines.push("");
  lines.push("=== Field differences: fallbacks.json ===");
  if (plan.fallbackDiffs.length === 0) {
    lines.push("(none)");
  } else {
    for (const d of plan.fallbackDiffs) {
      lines.push(`${d.modelId}.${d.field}: ${fmt(d.oldValue)} -> ${fmt(d.newValue)}`);
    }
  }

  lines.push("");
  lines.push("=== Excluded (kept at the curated value; never applied) ===");
  const excluded = [...plan.providerExcluded, ...plan.fallbackExcluded];
  if (excluded.length === 0) {
    lines.push("(none)");
  } else {
    for (const d of plan.providerExcluded) {
      lines.push(`${d.provider}/${d.modelId}.${d.field}: ${fmt(d.oldValue)} (kept) vs upstream ${fmt(d.newValue)}`);
    }
    for (const d of plan.fallbackExcluded) {
      lines.push(`${d.modelId}.${d.field}: ${fmt(d.oldValue)} (kept) vs upstream ${fmt(d.newValue)}`);
    }
  }

  lines.push("");
  lines.push("=== Ambiguous (fallbacks.json; upstream providers disagree) ===");
  if (plan.fallbackAmbiguous.length === 0) {
    lines.push("(none)");
  } else {
    for (const a of plan.fallbackAmbiguous) {
      const candidateText = a.candidates.map((c) => `${c.provider}=${fmt(c.value)}`).join(", ");
      lines.push(`${a.modelId}.${a.field}: ${candidateText}`);
    }
  }

  lines.push("");
  lines.push("=== Not found upstream ===");
  const missing = [...plan.providerMissing, ...plan.fallbackMissing.map((m) => `fallbacks/${m}`)];
  if (missing.length === 0) {
    lines.push("(none)");
  } else {
    for (const m of missing) lines.push(m);
  }

  lines.push("");
  lines.push("=== Summary ===");
  lines.push(`providers: ${plan.providerDiffs.length} diff(s) to apply, ${plan.providerExcluded.length} excluded, ${plan.providerMissing.length} not found upstream`);
  lines.push(`fallbacks: ${plan.fallbackDiffs.length} diff(s) to apply, ${plan.fallbackExcluded.length} excluded, ${plan.fallbackAmbiguous.length} ambiguous, ${plan.fallbackMissing.length} not found upstream`);
  lines.push(`mode: ${write ? "write (applied to disk)" : "dry-run (no files written; pass --write to apply)"}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// End-to-end run (used by both the CLI and tests)
// ---------------------------------------------------------------------------

/**
 * Validate the source tree, load the upstream catalog, compute the plan,
 * and — when write is true — apply it and re-validate. Throws on any
 * failure (invalid source tree pre-write, bad --pi-dist, or invalid source
 * tree post-write); a thrown error's .exitCode (default 1) is the intended
 * process exit code.
 */
export async function runSync(repoRoot, piDistArg, { write = false, cwd = process.cwd() } = {}) {
  const preErrors = validateSource(repoRoot);
  if (preErrors.length > 0) {
    const err = new Error(`source tree at ${repoRoot} is not currently valid; refusing to sync (${preErrors.length} error(s))`);
    err.exitCode = 1;
    err.errors = preErrors;
    throw err;
  }

  const MODELS = await loadPiModels(piDistArg, cwd);
  const plan = computeSyncPlan(repoRoot, MODELS);
  const report = formatReport(plan, { write });

  let touchedFiles = [];
  if (write) {
    touchedFiles = applyPlan(plan);
    const postErrors = validateSource(repoRoot);
    if (postErrors.length > 0) {
      const err = new Error(`write produced an invalid source tree (${postErrors.length} error(s)); the tree has already been modified on disk`);
      err.exitCode = 1;
      err.errors = postErrors;
      throw err;
    }
  }

  return { plan, report, touchedFiles, wrote: write };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let piDist;
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pi-dist") {
      piDist = argv[++i];
    } else if (a === "--write") {
      write = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/sync-from-pi.mjs --pi-dist <path> [--write]\n"
          + "  --pi-dist <path>  required. Path to the pi-ai package's model-catalog\n"
          + `                    directory (the one containing ${PI_MODELS_FILENAME}).\n`
          + "  --write           apply the computed diffs to providers/*.json and\n"
          + "                    fallbacks.json. Without this flag, prints a dry-run\n"
          + "                    summary only and writes nothing.",
      );
      process.exit(0);
    } else {
      console.error(`sync-from-pi: unrecognized argument: ${a}`);
      process.exit(2);
    }
  }
  return { piDist, write };
}

async function main() {
  const { piDist, write } = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = await runSync(REPO_ROOT, piDist, { write });
  } catch (err) {
    console.error(`sync-from-pi: ${err.message}`);
    if (Array.isArray(err.errors)) {
      for (const e of err.errors) console.error(`  - ${e}`);
    }
    process.exit(typeof err.exitCode === "number" ? err.exitCode : 1);
    return;
  }

  console.log(result.report);
  if (result.wrote) {
    for (const f of result.touchedFiles) console.log(`sync-from-pi: wrote ${f}`);
    if (result.touchedFiles.length > 0) {
      console.log("sync-from-pi: source tree re-validated OK. Consider also running: node scripts/validate-catalog.mjs");
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
