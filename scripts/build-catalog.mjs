#!/usr/bin/env node
// scripts/build-catalog.mjs
//
// Compiles providers/*.json + fallbacks.json + defaults.json into two release
// assets that are built together and published together:
//
//   dist/model-catalog.v2.json   the complete snapshot, including every
//                                capability-gated entry (schemaVersion 2)
//   dist/model-catalog.v1.json   the deterministic downgrade for readers that
//                                predate capability gating (schemaVersion 1)
//
// Both are complete snapshots, never per-provider patches, and both carry the
// same publishedAt: they are two views of one reviewed source tree, so a client
// can never see the two files at different ages. The v1 file is derived from the
// v2 data by pure removal (see projectV1FromV2) — it is never curated
// separately, and an entry that declares capabilities does not appear in it in
// any form.
//
// Why two assets rather than one: a client that predates v2 rejects an artifact
// carrying an unknown field *as a whole* and quietly keeps its cached catalog.
// Adding the field to v1 would therefore stop the update channel for every
// installed client, while removing the requirements from the entries instead
// would let an old reader mis-send a request shape it does not implement. The
// separate v1 projection is the only option that keeps old clients updating and
// never hands them a gated entry.
//
// Everything is validated before anything is written: the source tree as v2,
// the compiled v2 artifact, and the projected v1 artifact under the frozen v1
// rules. A failure at any stage exits non-zero and leaves dist/ untouched.
//
// The artifacts carry no separate version counter beyond schemaVersion: content
// identity is each file's own hash (computed by the consuming application), and
// build recency is ordered by publishedAt. publishedAt defaults to the current
// time but can be pinned with --published-at for a reproducible build.
//
// Zero runtime dependencies. Node >= 18.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSourceCatalog,
  validateSource,
  validateArtifact,
  isValidIso8601Utc,
  projectV1FromV2,
} from "./validate-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(REPO_ROOT, "dist");
const ARTIFACT_FILENAMES = Object.freeze({
  1: "model-catalog.v1.json",
  2: "model-catalog.v2.json",
});
const SCHEMA_VERSION = 2;

function assembleCatalog({ schemaVersion, publishedAt, providers, fallbacks, defaults }) {
  return {
    schemaVersion,
    publishedAt,
    providers,
    fallbacks,
    defaults,
  };
}

function serialize(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

/**
 * Compile the source tree into both catalog documents, validating before and
 * after assembly. Pure — performs no filesystem writes. Throws on any validation
 * failure, including an invalid `publishedAt` override; the caller decides what
 * to do with a failure (the CLI below prints and exits non-zero without
 * writing).
 *
 * Returns:
 *   catalog / catalogText   the v2 primary artifact (the historical names, kept
 *                           so existing contract tests read the full data)
 *   v1Catalog / v1CatalogText   the gated-entry-free v1 projection
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

  const { providers, fallbacks, defaults } = loadSourceCatalog(repoRoot);

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

  const catalog = assembleCatalog({
    schemaVersion: SCHEMA_VERSION,
    publishedAt,
    providers,
    fallbacks,
    defaults,
  });

  const postErrors = validateArtifact(catalog);
  if (postErrors.length > 0) {
    const err = new Error(`post-build v2 artifact validation failed with ${postErrors.length} error(s)`);
    err.errors = postErrors;
    throw err;
  }

  const projected = projectV1FromV2(providers, fallbacks, defaults);
  const v1Catalog = assembleCatalog({
    schemaVersion: 1,
    publishedAt,
    providers: projected.providers,
    fallbacks: projected.fallbacks,
    defaults: projected.defaults,
  });

  const v1Errors = validateArtifact(v1Catalog);
  if (v1Errors.length > 0) {
    const err = new Error(`post-build v1 projection validation failed with ${v1Errors.length} error(s)`);
    err.errors = v1Errors;
    throw err;
  }

  return {
    catalog,
    catalogText: serialize(catalog),
    v1Catalog,
    v1CatalogText: serialize(v1Catalog),
  };
}

function parseArgs(argv) {
  let publishedAtOverride;
  let target = "both";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--published-at") {
      publishedAtOverride = argv[++i];
    } else if (a === "--target") {
      target = argv[++i];
      if (!["v1", "v2", "both"].includes(target)) {
        console.error(`build-catalog: --target must be v1, v2 or both (got ${JSON.stringify(target)})`);
        process.exit(2);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/build-catalog.mjs [--published-at <iso-8601-utc>] [--target v1|v2|both]\n"
          + "  --published-at <iso>  override the publishedAt timestamp (must be strict\n"
          + "                        ISO 8601 UTC, e.g. 2026-08-20T12:34:56Z); default is now\n"
          + "  --target <which>      which artifact(s) to write; default both. Both are always\n"
          + "                        rebuilt and validated, so a partial write cannot publish a\n"
          + "                        stale view.",
      );
      process.exit(0);
    } else {
      console.error(`build-catalog: unrecognized argument: ${a}`);
      process.exit(2);
    }
  }
  return { publishedAtOverride, target };
}

function main() {
  const { publishedAtOverride, target } = parseArgs(process.argv.slice(2));

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
  if (target === "v2" || target === "both") {
    writeFileSync(join(DIST_DIR, ARTIFACT_FILENAMES[2]), result.catalogText, "utf8");
    console.log(`build-catalog: wrote dist/${ARTIFACT_FILENAMES[2]}`);
  }
  if (target === "v1" || target === "both") {
    writeFileSync(join(DIST_DIR, ARTIFACT_FILENAMES[1]), result.v1CatalogText, "utf8");
    console.log(`build-catalog: wrote dist/${ARTIFACT_FILENAMES[1]}`);
  }
  console.log(`build-catalog: publishedAt=${result.catalog.publishedAt}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
