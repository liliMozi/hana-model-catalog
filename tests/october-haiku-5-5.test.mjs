import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-10-25T00:00:00Z' });

test('Claude Haiku 5.5 exposes off plus five efforts through the anthropic-adaptive profile', () => {
  const haiku = catalog.providers.anthropic['claude-haiku-5-5'];
  assert.ok(haiku, 'anthropic/claude-haiku-5-5 must exist');
  assert.equal(haiku.name, 'Claude Haiku 5.5');
  assert.equal(haiku.context, 1000000);
  assert.equal(haiku.maxOutput, 128000);
  assert.equal(haiku.image, true);
  assert.equal(haiku.reasoning, true);
  assert.deepEqual(haiku.thinkingLevels, ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(haiku.thinkingLevelMap, { xhigh: 'max' },
    'the legacy xhigh mapping stays while the full ladder keeps xhigh distinct for new clients');
  assert.equal(haiku.defaultThinkingLevel, 'medium');
  assert.deepEqual(haiku.compat, {
    thinkingFormat: 'anthropic',
    reasoningProfile: 'anthropic-adaptive',
  });
  assert.equal('xhigh' in haiku, false, 'xhigh is a thinking level here, not the boolean capability flag');
  assert.equal('visionCapabilities' in haiku, false,
    'image input alone does not confirm grounding coordinates');
});

test('the generic Haiku 5.5 fallback carries description plus its capability requirement', () => {
  assert.deepEqual(catalog.fallbacks['claude-haiku-5-5'], {
    name: 'Claude Haiku 5.5',
    context: 1000000,
    maxOutput: 128000,
    image: true,
    reasoning: true,
    requiresCapabilities: ['anthropic-adaptive'],
  });
  for (const field of [
    'api', 'compat', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
    'xhigh', 'visionCapabilities', 'maxContext', 'serviceTiers', 'legacyCompatibility',
  ]) {
    assert.equal(field in catalog.fallbacks['claude-haiku-5-5'], false,
      `fallbacks.claude-haiku-5-5 must not carry ${field}`);
  }
});

test('Haiku 5.5 stays out of defaults and the new profile does not replace the always-on one', () => {
  assert.deepEqual(catalog.defaults.anthropic, [
    'claude-opus-5-5',
    'claude-fable-5-1',
    'claude-sonnet-5-5',
  ]);
  assert.equal(catalog.defaults.anthropic.includes('claude-haiku-5-5'), false);
  for (const id of [
    'claude-opus-5-5', 'claude-sonnet-5-5',
    'claude-fable-5-1', 'claude-mythos-5-1',
  ]) {
    assert.equal(catalog.providers.anthropic[id].compat.reasoningProfile, 'anthropic-adaptive-only',
      `${id} keeps the always-on adaptive contract`);
  }
});
