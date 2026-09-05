import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-09-05T00:00:00Z' });

test('Astra Fast remains a service tier and API and subscription limits stay separate', () => {
  const api = catalog.providers.openai['gpt-6-astra'];
  const oauth = catalog.providers['openai-codex-oauth']['gpt-6-astra'];
  for (const entry of [api, oauth]) {
    assert.deepEqual(entry.serviceTiers, ['standard', 'fast']);
    assert.deepEqual(entry.thinkingLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(entry.thinkingLevelMap.xhigh, 'max');
    assert.equal('max' in entry.thinkingLevelMap, false, 'preserve the published v1 map key vocabulary');
  }
  assert.equal('defaultThinkingLevel' in api, false, 'API default must not inherit a subscription default');
  assert.equal(oauth.defaultThinkingLevel, 'medium');
  assert.equal(api.context, 1050000);
  assert.equal(oauth.context, 272000);
  assert.equal(oauth.maxContext, 872000);
  assert.equal(catalog.providers.openai['gpt-6-astra-fast'], undefined);
});

test('recent models preserve their different reasoning contracts', () => {
  const fable = catalog.providers.anthropic['claude-fable-5-1'];
  assert.equal(fable.compat.reasoningProfile, 'anthropic-adaptive-only');
  assert.deepEqual(fable.thinkingLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(catalog.providers.gemini['gemini-3.8-flash'].thinkingLevels, ['low', 'medium', 'high']);
  for (const id of ['qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-max-2026-09-02', 'qwen3.8-flash']) {
    assert.equal(catalog.providers.dashscope[id].maxOutput, 131072);
    assert.deepEqual(catalog.providers.dashscope[id].quirks, ['enable_thinking']);
  }
});

test('new generic fallbacks cannot import official provider request settings', () => {
  for (const id of ['gpt-6-astra', 'claude-fable-5-1', 'claude-mythos-5-1', 'gemini-3.8-flash', 'qwen3.8-max', 'qwen3.8-flash']) {
    const fallback = catalog.fallbacks[id];
    assert.ok(fallback);
    for (const field of ['api', 'compat', 'serviceTiers', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel']) {
      assert.equal(field in fallback, false, `${id} must not inherit ${field}`);
    }
  }
});

test('disabling thinking remains selectable only on Claude models that accept it', () => {
  for (const id of ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8']) {
    assert.deepEqual(catalog.providers.anthropic[id].thinkingLevels, ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  }
  for (const id of ['claude-fable-5', 'claude-mythos-5', 'claude-fable-5-1', 'claude-mythos-5-1']) {
    assert.equal(catalog.providers.anthropic[id].thinkingLevels.includes('off'), false);
  }
});
