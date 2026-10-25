import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-10-25T00:00:00Z' });

const KIMI_CODING_K31 = [
  ['k3.1-pro', 'Kimi K3.1 Pro'],
  ['k3.1-pro-highspeed', 'Kimi K3.1 Pro Highspeed'],
];

test('Kimi Coding K3.1 entries use the plan-dependent 1M context and native effort ladder', () => {
  for (const [id, name] of KIMI_CODING_K31) {
    const entry = catalog.providers['kimi-coding'][id];
    assert.ok(entry, `kimi-coding/${id} must exist`);
    assert.equal(entry.name, name);
    assert.equal(entry.context, 1048576);
    assert.equal(entry.image, true);
    assert.equal(entry.video, true);
    assert.equal(entry.reasoning, true);
    assert.deepEqual(entry.thinkingLevels, ['low', 'high', 'max']);
    assert.equal(entry.thinkingLevels.includes('off'), false, 'K3.1 Pro rejects thinking off');
    assert.equal(entry.thinkingLevels.includes('medium'), false,
      'the subscription ladder has no medium level');
    assert.deepEqual(entry.thinkingLevelMap, { xhigh: 'max' });
    assert.equal(entry.defaultThinkingLevel, 'high',
      'the subscription default differs from the Moonshot API default max');
    assert.equal('maxOutput' in entry, false, 'the official page documents no separate output limit');
    assert.equal('compat' in entry, false, 'no unverified compatibility profile is added');
    assert.equal('xhigh' in entry, false, 'legacy xhigh maps to max without a separate native effort');
    assert.equal('visionCapabilities' in entry, false,
      'image/video input alone does not confirm grounding coordinates');
  }
});

test('K3 and K3-256K use the native low/high/max ladder with a high default', () => {
  for (const [id, context, hasVideo] of [
    ['k3', 1048576, true],
    ['k3-256k', 262144, false],
  ]) {
    const entry = catalog.providers['kimi-coding'][id];
    assert.ok(entry, `kimi-coding/${id} must exist`);
    assert.equal(entry.context, context);
    assert.equal(entry.image, true);
    assert.equal(entry.reasoning, true);
    if (hasVideo) {
      assert.equal(entry.video, true);
    } else {
      assert.equal('video' in entry, false, 'K3-256K documents image input only');
    }
    assert.deepEqual(entry.thinkingLevels, ['low', 'high', 'max']);
    assert.equal(entry.thinkingLevelMap.medium, 'high',
      'medium maps to the native high effort, not low');
    assert.equal(entry.defaultThinkingLevel, 'high');
  }
});

test('the historical Kimi for Coding entry and older Kimi IDs are retained', () => {
  const legacy = catalog.providers['kimi-coding']['kimi-for-coding'];
  assert.ok(legacy);
  assert.equal(legacy.maxOutput, 32768);
  assert.deepEqual(legacy.thinkingLevels, ['off', 'low', 'high', 'max']);
  assert.equal(legacy.defaultThinkingLevel, 'high');
  assert.deepEqual(legacy.compat, {
    thinkingFormat: 'kimi',
    reasoningProfile: 'kimi-openai',
  });
  for (const id of ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2']) {
    assert.ok(catalog.providers['kimi-coding'][id], `kimi-coding/${id} must be retained`);
  }
});
