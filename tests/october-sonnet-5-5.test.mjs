import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-10-25T00:00:00Z' });

test('Claude Sonnet 5.5 exposes the five documented efforts with the high default', () => {
  const sonnet = catalog.providers.anthropic['claude-sonnet-5-5'];
  assert.ok(sonnet, 'anthropic/claude-sonnet-5-5 must exist');
  assert.equal(sonnet.name, 'Claude Sonnet 5.5');
  assert.equal(sonnet.context, 1000000);
  assert.equal(sonnet.maxOutput, 128000);
  assert.equal(sonnet.image, true);
  assert.equal(sonnet.reasoning, true);
  assert.deepEqual(sonnet.thinkingLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(sonnet.thinkingLevels.includes('off'), false,
    'Sonnet 5.5 rejects thinking.type=disabled; between_tools is not an effort choice');
  assert.deepEqual(sonnet.thinkingLevelMap, { xhigh: 'max' },
    'the legacy xhigh mapping stays for older clients while the full ladder lets new clients distinguish xhigh');
  assert.equal(sonnet.defaultThinkingLevel, 'high');
  assert.deepEqual(sonnet.compat, {
    thinkingFormat: 'anthropic',
    reasoningProfile: 'anthropic-adaptive-only',
  });
  assert.equal('visionCapabilities' in sonnet, false,
    'image input alone does not confirm grounding coordinates');
});

test('the generic Sonnet 5.5 fallback carries description only', () => {
  assert.deepEqual(catalog.fallbacks['claude-sonnet-5-5'], {
    name: 'Claude Sonnet 5.5',
    context: 1000000,
    maxOutput: 128000,
    image: true,
    reasoning: true,
  });
  for (const field of [
    'api', 'compat', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
    'xhigh', 'visionCapabilities', 'maxContext', 'serviceTiers', 'legacyCompatibility',
  ]) {
    assert.equal(field in catalog.fallbacks['claude-sonnet-5-5'], false,
      `fallbacks.claude-sonnet-5-5 must not carry ${field}`);
  }
});

test('the curated Anthropic list swaps Sonnet 5 for Sonnet 5.5 without reordering', () => {
  assert.deepEqual(catalog.defaults.anthropic, [
    'claude-opus-5-5',
    'claude-fable-5-1',
    'claude-sonnet-5-5',
  ]);
  assert.ok(catalog.providers.anthropic['claude-sonnet-5'],
    'the older Sonnet 5 entry is retained for existing selections');
});
