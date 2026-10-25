import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-10-25T00:00:00Z' });

const KIMI_K31 = [
  ['kimi-k3.1-pro', 'Kimi K3.1 Pro'],
  ['kimi-k3.1-pro-highspeed', 'Kimi K3.1 Pro Highspeed'],
];

test('Kimi K3.1 native entries expose the documented context and settable output ceiling', () => {
  for (const [id, name] of KIMI_K31) {
    const entry = catalog.providers.moonshot[id];
    assert.ok(entry, `moonshot/${id} must exist`);
    assert.equal(entry.name, name);
    assert.equal(entry.context, 1048576);
    assert.equal(entry.maxOutput, 1048576,
      'maxOutput is the maximum settable max_completion_tokens, not the 131072 default');
    assert.equal(entry.image, true);
    assert.equal(entry.video, true);
    assert.equal(entry.reasoning, true);
    assert.deepEqual(entry.thinkingLevels, ['low', 'high', 'max']);
    assert.equal(entry.thinkingLevels.includes('off'), false, 'K3.1 always thinks');
    assert.equal(entry.thinkingLevels.includes('medium'), false,
      'the native effort ladder has no medium level');
    assert.deepEqual(entry.thinkingLevelMap, { xhigh: 'max' });
    assert.equal(entry.defaultThinkingLevel, 'max');
    assert.equal('compat' in entry, false, 'the K2 profile must not be copied onto K3.1');
    assert.equal('xhigh' in entry, false, 'legacy xhigh maps to max without a separate native effort');
    assert.equal('visionCapabilities' in entry, false,
      'image/video input alone does not confirm grounding coordinates');
  }
});

test('the generic Kimi K3.1 fallbacks carry description plus the same requirement as their native entries', () => {
  for (const [id, name] of KIMI_K31) {
    assert.deepEqual(catalog.fallbacks[id], {
      name,
      context: 1048576,
      maxOutput: 1048576,
      image: true,
      video: true,
      reasoning: true,
      requiresCapabilities: ['kimi-k31-native-openai'],
    });
    assert.deepEqual(catalog.fallbacks[id].requiresCapabilities,
      catalog.providers.moonshot[id].requiresCapabilities,
      `fallbacks.${id} must not weaken the native entry's gate`);
    for (const field of [
      'api', 'compat', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
      'xhigh', 'visionCapabilities', 'maxContext', 'serviceTiers', 'legacyCompatibility',
    ]) {
      assert.equal(field in catalog.fallbacks[id], false,
        `fallbacks.${id} must not carry ${field}`);
    }
  }
});

test('existing Kimi K2.6 and K2 Thinking entries are retained', () => {
  assert.ok(catalog.providers.moonshot['kimi-k2.6'], 'the existing K2.6 entry is retained');
  assert.ok(catalog.providers.moonshot['kimi-k2-thinking'], 'the existing K2 thinking entry is retained');
});
