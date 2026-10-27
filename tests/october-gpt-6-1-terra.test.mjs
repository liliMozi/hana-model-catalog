import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog, v1Catalog } = buildCatalog(root, { publishedAt: '2026-10-27T00:00:00Z' });

const ID = 'gpt-6.1-terra';

test('GPT-6.1 Terra carries the documented six efforts including off on the API surface', () => {
  const api = catalog.providers.openai[ID];
  assert.ok(api, 'openai/gpt-6.1-terra must exist');
  assert.equal(api.name, 'GPT-6.1 Terra');
  assert.equal(api.context, 1050000);
  assert.equal(api.maxOutput, 128000);
  assert.equal(api.image, true);
  assert.equal(api.reasoning, true);
  assert.equal(api.api, 'openai-responses');
  assert.deepEqual(api.thinkingLevels, ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(api.thinkingLevelMap, { off: 'none', xhigh: 'max' });
  assert.equal(api.defaultThinkingLevel, 'medium');
  assert.deepEqual(api.serviceTiers, ['standard', 'fast']);
  assert.equal('visionCapabilities' in api, false, 'image input alone does not confirm grounding');
  assert.equal('maxContext' in api, false);
});

test('OpenRouter GPT-6.1 Terra mirrors the descriptive metadata and keeps the gateway protocol', () => {
  const router = catalog.providers.openrouter[`openai/${ID}`];
  assert.ok(router, 'openrouter/openai/gpt-6.1-terra must exist');
  assert.equal(router.name, 'OpenAI GPT-6.1 Terra');
  const api = catalog.providers.openai[ID];
  for (const field of ['context', 'maxOutput', 'image', 'reasoning']) {
    assert.equal(router[field], api[field], `${field} must mirror the native description`);
  }
  assert.equal(router.api, 'openai-completions', 'the mirror keeps the GPT-6 Sol router wiring');
  assert.deepEqual(router.thinkingLevels, ['off', 'low', 'medium', 'high', 'max']);
  assert.deepEqual(router.thinkingLevelMap, { off: 'none', xhigh: 'max' });
  assert.equal(router.defaultThinkingLevel, 'medium');
  assert.equal('serviceTiers' in router, false, 'the gateway documents no native service tiers');
  assert.equal('compat' in router, false);
});

test('the generic GPT-6.1 Terra fallback is descriptive only', () => {
  const fallback = catalog.fallbacks[ID];
  assert.ok(fallback, 'fallbacks.gpt-6.1-terra must exist');
  assert.deepEqual(fallback, {
    name: 'GPT-6.1 Terra',
    context: 1050000,
    maxOutput: 128000,
    image: true,
    reasoning: true,
  });
  assert.deepEqual(Object.keys(fallback).sort(),
    ['context', 'image', 'maxOutput', 'name', 'reasoning']);
  assert.equal('requiresCapabilities' in fallback, false, 'Terra relies on no new client capability');
});

test('the Codex OAuth GPT-6.1 Terra entry records the curated context and no inferred fields', () => {
  const oauth = catalog.providers['openai-codex-oauth'][ID];
  assert.ok(oauth, 'openai-codex-oauth/gpt-6.1-terra must exist');
  assert.equal(oauth.name, 'GPT-6.1 Terra');
  assert.equal(oauth.context, 800000);
  assert.equal(oauth.image, true);
  assert.equal(oauth.reasoning, true);
  assert.equal(oauth.api, 'openai-codex-responses');
  for (const field of ['maxOutput', 'maxContext', 'thinkingLevels', 'thinkingLevelMap',
    'defaultThinkingLevel', 'serviceTiers', 'visionCapabilities']) {
    assert.equal(field in oauth, false,
      `${field} has no independent source for the OAuth surface and must stay unset`);
  }
});

test('GPT-6.1 Terra leads the Codex OAuth curated list and the API entry stays out of it', () => {
  assert.deepEqual(catalog.defaults['openai-codex-oauth'], [ID, 'gpt-6-sol', 'gpt-6-luna']);
  assert.equal(catalog.defaults['openai-codex-oauth'].includes('gpt-6-astra'), false,
    'Astra keeps its entry but leaves the three-model recommendation');
  assert.ok(catalog.providers['openai-codex-oauth']['gpt-6-astra'],
    'Astra is preserved on the partition, only the recommendation changed');
  assert.deepEqual(catalog.defaults.openai, ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna'],
    'the API default list is unchanged by this batch');
  assert.equal(catalog.defaults['openai-codex-oauth'].includes(ID), true);
});

test('both artifacts keep the Terra entries and the same curated order', () => {
  for (const doc of [catalog, v1Catalog]) {
    assert.ok(doc.providers.openai[ID], `schemaVersion ${doc.schemaVersion}: openai entry`);
    assert.ok(doc.providers.openrouter[`openai/${ID}`], `schemaVersion ${doc.schemaVersion}: router entry`);
    assert.ok(doc.providers['openai-codex-oauth'][ID], `schemaVersion ${doc.schemaVersion}: oauth entry`);
    assert.deepEqual(doc.fallbacks[ID], catalog.fallbacks[ID],
      `schemaVersion ${doc.schemaVersion}: fallback survives the projection`);
    assert.deepEqual(doc.defaults['openai-codex-oauth'], [ID, 'gpt-6-sol', 'gpt-6-luna'],
      `schemaVersion ${doc.schemaVersion}: curated order`);
  }
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(v1Catalog.schemaVersion, 1);
});
