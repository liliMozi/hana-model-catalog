import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog, v1Catalog } = buildCatalog(root, { publishedAt: '2026-11-25T00:00:00Z' });

// Section 1: owner-curated Codex OAuth context for GPT-6.2 Astra.
test('the Codex OAuth GPT-6.2 Astra context is the curated 500,000', () => {
  const oauth = catalog.providers['openai-codex-oauth']['gpt-6.2-astra'];
  assert.equal(oauth.context, 500000,
    'owner decision matching the Terra 800,000 convention, not the 272,000 published default');
  for (const doc of [catalog, v1Catalog]) {
    assert.equal(doc.providers['openai-codex-oauth']['gpt-6.2-astra'].context, 500000,
      `schemaVersion ${doc.schemaVersion}: curated context survives the projection`);
  }
});

// Section 2: kimi-for-coding refresh to the K2.8 Preview contract.
test('kimi-for-coding reflects the K2.8 Preview spec from the official model table', () => {
  const entry = catalog.providers['kimi-coding']['kimi-for-coding'];
  assert.ok(entry, 'kimi-coding/kimi-for-coding must exist');
  assert.equal(entry.name, 'Kimi for Coding');
  assert.equal(entry.context, 1048576, 'the official page documents up to 1,048,576');
  assert.equal(entry.image, true);
  assert.equal(entry.video, true, 'the K2.8 row documents image and video input');
  assert.equal(entry.reasoning, true);
  assert.deepEqual(entry.thinkingLevels, ['off', 'low', 'high', 'max'],
    'off stays because thinking-off routes to the non-thinking K2.8 variant');
  assert.deepEqual(entry.thinkingLevelMap,
    { off: null, low: 'low', medium: 'high', high: 'high', xhigh: 'max' },
    'the existing map already matches the documented effort mapping');
  assert.equal(entry.defaultThinkingLevel, 'max', 'the K2.8 Preview default is max');
  assert.equal('compat' in entry, false,
    'the documented request parameter is top-level reasoning_effort — the K3 shape, no K2 thinking object');
  assert.equal('maxOutput' in entry, false,
    'the official page documents no separate output limit');
  assert.ok(entry.visionCapabilities, 'vision capabilities are retained');
});

test('kimi-for-coding-highspeed records the always-on K2.7 Code Highspeed', () => {
  const entry = catalog.providers['kimi-coding']['kimi-for-coding-highspeed'];
  assert.ok(entry, 'kimi-coding/kimi-for-coding-highspeed must exist');
  assert.equal(entry.name, 'Kimi for Coding Highspeed');
  assert.equal(entry.context, 262144);
  assert.equal(entry.image, true);
  assert.equal(entry.video, true);
  assert.equal(entry.reasoning, true);
  for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
    'compat', 'maxOutput', 'visionCapabilities']) {
    assert.equal(field in entry, false,
      `${field}: thinking is always on with no adjustable level, and no output cap is documented`);
  }
});

test('the kimi-for-coding pair mirrors into descriptive fallbacks and stays ungated in v1', () => {
  assert.deepEqual(catalog.fallbacks['kimi-for-coding'], {
    name: 'Kimi for Coding',
    context: 1048576,
    image: true,
    video: true,
    reasoning: true,
    visionCapabilities: catalog.providers['kimi-coding']['kimi-for-coding'].visionCapabilities,
  });
  assert.deepEqual(catalog.fallbacks['kimi-for-coding-highspeed'], {
    name: 'Kimi for Coding Highspeed',
    context: 262144,
    image: true,
    video: true,
    reasoning: true,
  });
  for (const doc of [catalog, v1Catalog]) {
    for (const id of ['kimi-for-coding', 'kimi-for-coding-highspeed']) {
      assert.ok(doc.providers['kimi-coding'][id],
        `schemaVersion ${doc.schemaVersion}: kimi-coding/${id} must be present`);
      assert.equal('requiresCapabilities' in doc.providers['kimi-coding'][id], false,
        'the K3 request shape already ships ungated on this partition');
      assert.deepEqual(doc.fallbacks[id], catalog.fallbacks[id]);
    }
  }
  assert.deepEqual(catalog.defaults['kimi-coding'], ['kimi-for-coding'],
    'the curated Kimi Coding list is unchanged');
});
