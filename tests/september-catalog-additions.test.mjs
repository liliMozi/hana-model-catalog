import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-09-22T00:00:00Z' });

const additions = [
  ['anthropic', 'claude-opus-5-5'],
  ['openai', 'gpt-6-sol'],
  ['openai', 'gpt-6-luna'],
  ['mimo', 'mimo-v2.6-pro'],
  ['mimo', 'mimo-v2.6-flash'],
  ['mimo', 'mimo-v2.6-pro-ultraspeed'],
  ['xai', 'grok-4.7'],
  ['zhipu', 'glm-5.3-flashx'],
  ['dashscope', 'qwen3.8-omni-flash'],
  ['volcengine', 'doubao-seed-2-1-pro-260915'],
  ['openai', 'gpt-image-2.5-sunburst'],
  ['openai', 'gpt-image-2.5-flare'],
  ['openai', 'gpt-6.1-sol'],
];

const descriptiveFields = new Set([
  'name', 'context', 'maxOutput', 'image', 'video', 'audio', 'reasoning', 'type',
]);

test('new generic entries preserve descriptive metadata without provider request controls', () => {
  for (const [provider, id] of additions) {
    const source = catalog.providers[provider][id];
    assert.ok(source, `${provider}/${id} must exist`);
    const expected = Object.fromEntries(
      Object.entries(source).filter(([field]) => descriptiveFields.has(field)),
    );
    assert.deepEqual(catalog.fallbacks[id], expected, `${id} generic metadata`);
  }
  assert.equal('maxOutput' in catalog.fallbacks['grok-4.7'], false,
    'an OpenRouter-only output cap must not leak into the generic entry');
});

test('Qwen Omni describes multimodal text generation without subscription or realtime aliases', () => {
  const omni = catalog.providers.dashscope['qwen3.8-omni-flash'];
  assert.equal(omni.context, 1000000);
  assert.equal(omni.maxOutput, 131072);
  for (const field of ['image', 'video', 'audio', 'reasoning']) {
    assert.equal(omni[field], true, field);
  }
  assert.equal('type' in omni, false);
  assert.equal('quirks' in omni, false, 'do not copy the older Omni thinking switch');
  assert.deepEqual(omni.thinkingLevels, ['off', 'low', 'medium', 'high']);
  assert.deepEqual(omni.thinkingLevelMap, { off: 'none', low: 'low', medium: 'medium', high: 'xhigh' });
  assert.equal(omni.defaultThinkingLevel, 'high');
  assert.deepEqual(omni.compat, { supportsReasoningEffort: true });
  assert.equal('xhigh' in omni, false, 'the high choice already maps to the top native effort');
  for (const provider of ['dashscope-coding', 'dashscope-token-plan']) {
    assert.equal(catalog.providers[provider]['qwen3.8-omni-flash'], undefined);
  }
  for (const id of ['qwen3.8-omni-flash-realtime', 'qwen3.8-livetranslate-flash-realtime']) {
    assert.equal(catalog.providers.dashscope[id], undefined);
  }
});

test('the dated Doubao snapshot has its own limits without expanding Coding Plan availability', () => {
  const id = 'doubao-seed-2-1-pro-260915';
  const snapshot = catalog.providers.volcengine[id];
  assert.equal(snapshot.context, 1048576);
  assert.equal(snapshot.maxOutput, 262144);
  assert.equal(snapshot.image, true);
  assert.equal(snapshot.video, true);
  assert.equal(snapshot.reasoning, true);
  assert.equal('visionCapabilities' in snapshot, false);
  assert.equal(catalog.providers['volcengine-coding'][id], undefined);
  assert.ok(catalog.providers.volcengine['doubao-seed-2-1-pro-260628']);
  assert.ok(catalog.providers['volcengine-coding']['doubao-seed-evolving']);
});

test('image generation quality is not exposed as chat reasoning or Codex entitlement', () => {
  for (const [id, name] of [
    ['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'],
    ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare'],
  ]) {
    assert.deepEqual(catalog.providers.openai[id], { name, type: 'image', image: true });
    assert.equal(catalog.providers['openai-codex-oauth'][id], undefined);
  }
});

test('GPT-6.1 Sol carries five efforts with no off choice on both the API and router surfaces', () => {
  const api = catalog.providers.openai['gpt-6.1-sol'];
  assert.equal(api.name, 'GPT-6.1 Sol');
  assert.equal(api.context, 1050000);
  assert.equal(api.maxOutput, 128000);
  assert.equal(api.image, true);
  assert.equal(api.reasoning, true);
  assert.equal(api.api, 'openai-responses');
  assert.deepEqual(api.thinkingLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(api.thinkingLevels.includes('off'), false,
    'the reference states none and minimal are unsupported, so there is no off choice');
  assert.deepEqual(api.thinkingLevelMap, { xhigh: 'max' });
  assert.equal(api.defaultThinkingLevel, 'medium');
  assert.deepEqual(api.serviceTiers, ['standard', 'fast']);

  const router = catalog.providers.openrouter['openai/gpt-6.1-sol'];
  assert.equal(router.name, 'OpenAI GPT-6.1 Sol');
  assert.equal(router.context, 1050000);
  assert.equal(router.maxOutput, 128000);
  assert.equal(router.image, true);
  assert.equal(router.reasoning, true);
  assert.equal(router.api, 'openai-completions', 'the mirror keeps the GPT-6 Sol router wiring');
  assert.deepEqual(router.thinkingLevels, ['low', 'medium', 'high', 'max']);
  assert.equal(router.thinkingLevels.includes('off'), false, 'the underlying model rejects none');
  assert.deepEqual(router.thinkingLevelMap, { xhigh: 'max' });
  assert.equal(router.defaultThinkingLevel, 'medium');
  assert.equal('serviceTiers' in router, false);
});

test('GPT-6.1 Sol stays off the Codex OAuth surface until its numbers have a public source', () => {
  assert.equal(
    catalog.providers['openai-codex-oauth']['gpt-6.1-sol'],
    undefined,
    'context_window / max_context_window / minimal_client_version are not publicly documented yet',
  );
});

test('the undocumented openrouter sol-pro alias is not promoted into the catalog', () => {
  for (const id of ['openai/gpt-6.1-sol-pro', 'gpt-6.1-sol-pro']) {
    assert.equal(catalog.providers.openrouter[id], undefined);
    assert.equal(catalog.providers.openai[id], undefined);
  }
});
