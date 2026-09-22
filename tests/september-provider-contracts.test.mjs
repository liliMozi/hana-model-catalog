import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-09-22T00:00:00Z' });

const MIMO_V26 = ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed'];
const MIMO_V26_NAMES = {
  'mimo-v2.6-pro': 'MiMo V2.6 Pro',
  'mimo-v2.6-flash': 'MiMo V2.6 Flash',
  'mimo-v2.6-pro-ultraspeed': 'MiMo V2.6 Pro UltraSpeed',
};
const OMNI_MODALITY = ['image', 'audio', 'video', 'reasoning'];
// Fields the MiMo docs did not establish for the V2.6 text models. The
// source lists an omni-modal capability and a deep-thinking mode, but no
// grounding descriptor and no explicit effort ladder.
const UNCONFIRMED_MIMO_FIELDS = [
  'xhigh', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
  'compat', 'visionCapabilities',
];

test('MiMo V2.6 native models expose only the confirmed omni-modal limits', () => {
  for (const id of MIMO_V26) {
    const entry = catalog.providers.mimo[id];
    assert.equal(entry.name, MIMO_V26_NAMES[id]);
    assert.equal(entry.context, 1048576);
    assert.equal(entry.maxOutput, 131072);
    for (const field of OMNI_MODALITY) {
      assert.equal(entry[field], true, `mimo ${id}.${field} must be true`);
    }
    for (const field of UNCONFIRMED_MIMO_FIELDS) {
      assert.equal(field in entry, false, `mimo ${id} must not carry unconfirmed field ${field}`);
    }
  }
});

test('xAI Grok 4.7 omits any output ceiling and exposes the low/medium/high/xhigh ladder', () => {
  const grok = catalog.providers.xai['grok-4.7'];
  assert.equal(grok.name, 'Grok 4.7');
  assert.equal(grok.context, 500000);
  assert.equal(grok.image, true);
  assert.equal(grok.reasoning, true);
  assert.equal('maxOutput' in grok, false, 'xAI documents no separate output limit for grok-4.7');
  assert.deepEqual(grok.thinkingLevels, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(grok.defaultThinkingLevel, 'high');
  assert.equal(grok.compat.supportsReasoningEffort, true);
  assert.equal(grok.thinkingLevelMap.xhigh, 'xhigh');
  assert.equal('xhigh' in grok, false, 'xhigh is a thinking level here, not the boolean capability flag');
});

test('unpublished fast and latest aliases stay absent', () => {
  for (const id of ['grok-4.7-fast', 'grok-4.7-latest', 'grok4.7fast', 'grok-4-7']) {
    assert.equal(catalog.providers.xai[id], undefined, `xai/${id} must not exist`);
  }
  for (const id of [
    'xiaomi/mimo-v2.6-pro-fast',
    'xiaomi/mimo-v2.6-pro-latest',
    'x-ai/grok-4.7-fast',
    'z-ai/glm-5.3-flashx-latest',
  ]) {
    assert.equal(catalog.providers.openrouter[id], undefined, `openrouter/${id} must not exist`);
  }
});

test('GLM-5.3 FlashX mirrors GLM-5.3 Flash on the API surface and stays off the coding plan', () => {
  const flashx = catalog.providers.zhipu['glm-5.3-flashx'];
  const flash = catalog.providers.zhipu['glm-5.3-flash'];
  assert.equal(flashx.name, 'GLM-5.3 FlashX');
  for (const field of ['context', 'maxOutput', 'image', 'video', 'reasoning', 'xhigh', 'defaultThinkingLevel']) {
    assert.equal(flashx[field], flash[field], `glm-5.3-flashx.${field} must match glm-5.3-flash`);
  }
  assert.deepEqual(flashx.thinkingLevels, ['low', 'high', 'max']);
  assert.equal(
    'glm-5.3-flashx' in catalog.providers['zhipu-coding'],
    false,
    'FlashX is not offered on the GLM Coding Plan',
  );
});

test('OpenRouter MiMo V2.6 entries mirror the native provider parameters', () => {
  for (const id of MIMO_V26) {
    const router = catalog.providers.openrouter[`xiaomi/${id}`];
    const native = catalog.providers.mimo[id];
    for (const field of ['context', 'maxOutput', ...OMNI_MODALITY]) {
      assert.equal(router[field], native[field], `openrouter/xiaomi/${id}.${field} must match the native entry`);
    }
    for (const field of UNCONFIRMED_MIMO_FIELDS) {
      assert.equal(field in router, false, `openrouter/xiaomi/${id} must not carry unconfirmed field ${field}`);
    }
  }
});

test('OpenRouter Grok 4.7 uses the router output ceiling without copying the xAI wire compat', () => {
  const router = catalog.providers.openrouter['x-ai/grok-4.7'];
  assert.equal(router.context, 500000);
  assert.equal(router.maxOutput, 450000, 'OpenRouter advertises a 450k completion cap');
  assert.equal(router.image, true);
  assert.equal(router.reasoning, true);
  assert.deepEqual(router.thinkingLevels, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(router.defaultThinkingLevel, 'high');
  assert.equal('compat' in router, false, 'xAI supportsReasoningEffort must not be copied onto the router entry');
  assert.equal('thinkingLevelMap' in router, false);
});

test('OpenRouter GLM-5.3 FlashX keeps the router wiring of GLM-5.3 Flash', () => {
  const flashx = catalog.providers.openrouter['z-ai/glm-5.3-flashx'];
  const flash = catalog.providers.openrouter['z-ai/glm-5.3-flash'];
  for (const field of ['context', 'maxOutput', 'image', 'video', 'reasoning', 'xhigh', 'defaultThinkingLevel']) {
    assert.equal(flashx[field], flash[field], `openrouter z-ai/glm-5.3-flashx.${field} must match z-ai/glm-5.3-flash`);
  }
  assert.deepEqual(flashx.thinkingLevels, flash.thinkingLevels);
});
