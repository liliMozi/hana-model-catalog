#!/usr/bin/env node
// scripts/build-catalog.mjs
//
// Compiles providers/*.json + fallbacks.json into the single release asset:
//   dist/model-catalog.v1.json   the complete catalog snapshot
//
// The runtime artifact is always a complete snapshot, never a per-provider
// patch. The build validates the source tree before compiling and validates
// the compiled artifact before writing anything to disk — a failure at
// either stage exits non-zero and leaves dist/ untouched.
//
// The artifact carries no separate version counter: its content identity is
// its own hash (computed by the consuming application, not shipped
// alongside it), and build recency is ordered by publishedAt, the UTC
// build timestamp. publishedAt defaults to the current time but can be
// pinned with --published-at for a reproducible build.
//
// Zero runtime dependencies. Node >= 18.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog, validateSource, validateArtifact, isValidIso8601Utc } from "./validate-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(REPO_ROOT, "dist");
const CATALOG_FILENAME = "model-catalog.v1.json";
const SCHEMA_VERSION = 1;

/**
 * Compile the source tree into the catalog document, validating before and
 * after assembly. Pure — performs no filesystem writes. Throws on any
 * validation failure, including an invalid `publishedAt` override; the
 * caller decides what to do with a failure (the CLI below prints and exits
 * non-zero without writing).
 *
 * `publishedAt`, when given, must already be a strict ISO 8601 UTC string
 * (e.g. "2026-08-20T12:34:56Z") and is used verbatim, bypassing `now`.
 * Otherwise the timestamp is `now().toISOString()`.
 */
export function buildCatalog(repoRoot, { now = () => new Date(), publishedAt: publishedAtOverride } = {}) {
  const preErrors = validateSource(repoRoot);
  if (preErrors.length > 0) {
    const err = new Error(`pre-build source validation failed with ${preErrors.length} error(s)`);
    err.errors = preErrors;
    throw err;
  }

  const { providers, fallbacks } = loadSourceCatalog(repoRoot);

  let publishedAt;
  if (publishedAtOverride !== undefined) {
    if (!isValidIso8601Utc(publishedAtOverride)) {
      throw new Error(
        `invalid --published-at value: ${JSON.stringify(publishedAtOverride)} `
          + `(must be a valid ISO 8601 UTC timestamp, e.g. 2026-08-20T12:34:56Z)`,
      );
    }
    publishedAt = publishedAtOverride;
  } else {
    publishedAt = now().toISOString();
  }

  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    publishedAt,
    providers,
    fallbacks,
  };

  const postErrors = validateArtifact(catalog);
  if (postErrors.length > 0) {
    const err = new Error(`post-build artifact validation failed with ${postErrors.length} error(s)`);
    err.errors = postErrors;
    throw err;
  }

  const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;

  return { catalog, catalogText };
}

function parseArgs(argv) {
  let publishedAtOverride;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--published-at") {
      publishedAtOverride = argv[++i];
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/build-catalog.mjs [--published-at <iso-8601-utc>]\n"
          + "  --published-at <iso>  override the publishedAt timestamp (must be strict\n"
          + "                        ISO 8601 UTC, e.g. 2026-08-20T12:34:56Z); default is now",
      );
      process.exit(0);
    } else {
      console.error(`build-catalog: unrecognized argument: ${a}`);
      process.exit(2);
    }
  }
  return { publishedAtOverride };
}

function main() {
  const { publishedAtOverride } = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = buildCatalog(REPO_ROOT, publishedAtOverride !== undefined ? { publishedAt: publishedAtOverride } : {});
  } catch (err) {
    console.error(`build-catalog: ${err.message}`);
    if (Array.isArray(err.errors)) {
      for (const e of err.errors) console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, CATALOG_FILENAME), result.catalogText, "utf8");

  console.log(`build-catalog: wrote dist/${CATALOG_FILENAME}`);
  console.log(`build-catalog: publishedAt=${result.catalog.publishedAt}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
