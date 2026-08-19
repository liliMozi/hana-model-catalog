#!/usr/bin/env node
// scripts/build-catalog.mjs
//
// Compiles providers/*.json + fallbacks.json into the two release assets:
//   dist/model-catalog.v1.json            the complete catalog snapshot
//   dist/model-catalog-manifest.v1.json   schemaVersion, catalogVersion,
//                                         publishedAt, target SHA-256 and
//                                         byte size
//
// The runtime artifact is always a complete snapshot, never a per-provider
// patch. The build validates the source tree before compiling and validates
// the compiled artifact before writing anything to disk — a failure at
// either stage exits non-zero and leaves dist/ untouched.
//
// Zero runtime dependencies. Node >= 18.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog, validateSource, validateArtifact } from "./validate-catalog.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(REPO_ROOT, "dist");
const CATALOG_FILENAME = "model-catalog.v1.json";
const MANIFEST_FILENAME = "model-catalog-manifest.v1.json";
const SCHEMA_VERSION = 1;

function readCatalogVersion(repoRoot) {
  const path = join(repoRoot, "catalog-version.json");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`catalog-version.json: cannot read/parse (${err.message})`);
  }
  if (!Number.isInteger(parsed.catalogVersion) || parsed.catalogVersion <= 0) {
    throw new Error(`catalog-version.json: catalogVersion must be a positive integer, got ${JSON.stringify(parsed.catalogVersion)}`);
  }
  return parsed.catalogVersion;
}

/**
 * Compile the source tree into the catalog document and its manifest,
 * validating before and after assembly. Pure — performs no filesystem
 * writes. Throws on any validation failure; the caller decides what to do
 * with a failure (the CLI below prints and exits non-zero without writing).
 */
export function buildCatalog(repoRoot, { now = () => new Date() } = {}) {
  const preErrors = validateSource(repoRoot);
  if (preErrors.length > 0) {
    const err = new Error(`pre-build source validation failed with ${preErrors.length} error(s)`);
    err.errors = preErrors;
    throw err;
  }

  const { providers, fallbacks } = loadSourceCatalog(repoRoot);
  const catalogVersion = readCatalogVersion(repoRoot);
  const publishedAt = now().toISOString();

  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion,
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
  const sha256 = createHash("sha256").update(catalogText, "utf8").digest("hex");
  const byteSize = Buffer.byteLength(catalogText, "utf8");

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion,
    publishedAt,
    minReader: 1,
    target: {
      file: CATALOG_FILENAME,
      sha256,
      byteSize,
    },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  return { catalog, catalogText, manifest, manifestText };
}

function main() {
  let result;
  try {
    result = buildCatalog(REPO_ROOT);
  } catch (err) {
    console.error(`build-catalog: ${err.message}`);
    if (Array.isArray(err.errors)) {
      for (const e of err.errors) console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, CATALOG_FILENAME), result.catalogText, "utf8");
  writeFileSync(join(DIST_DIR, MANIFEST_FILENAME), result.manifestText, "utf8");

  console.log(`build-catalog: wrote dist/${CATALOG_FILENAME}`);
  console.log(`build-catalog: wrote dist/${MANIFEST_FILENAME}`);
  console.log(
    `build-catalog: catalogVersion=${result.catalog.catalogVersion} `
      + `publishedAt=${result.catalog.publishedAt} sha256=${result.manifest.target.sha256} `
      + `bytes=${result.manifest.target.byteSize}`,
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
