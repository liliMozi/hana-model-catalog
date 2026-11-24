import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog, v1Catalog } = buildCatalog(root, { publishedAt: '2026-11-25T00:00:00Z' });

const WIRE_FIELDS = [
  'api', 'compat', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
  'xhigh', 'visionCapabilities', 'maxContext', 'serviceTiers', 'legacyCompatibility',
  'requiresCapabilities',
];

test('GPT-6.2 Astra and Sol carry the five documented efforts with no off choice on the API surface', () => {
  for (const [id, name] of [
    ['gpt-6.2-astra', 'GPT-6.2 Astra'],
    ['gpt-6.2-sol', 'GPT-6.2 Sol'],
  ]) {
    const api = catalog.providers.openai[id];
    assert.ok(api, `openai/${id} must exist`);
    assert.equal(api.name, name);
    assert.equal(api.context, 1050000);
    assert.equal(api.maxOutput, 128000);
    assert.equal(api.image, true);
    assert.equal(api.reasoning, true);
    assert.equal(api.api, 'openai-responses');
    assert.deepEqual(api.thinkingLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(api.thinkingLevels.includes('off'), false,
      'the reference states none is rejected, so there is no off choice');
    assert.deepEqual(api.thinkingLevelMap, { xhigh: 'max' });
    assert.equal(api.defaultThinkingLevel, 'medium');
    assert.deepEqual(api.serviceTiers, ['standard', 'fast']);
    assert.equal('visionCapabilities' in api, false);
    assert.equal('maxContext' in api, false);
  }
});

test('the Codex OAuth GPT-6.2 and GPT-6.1 Sol entries record the published default windows and no inferred fields', () => {
  for (const [id, name, context] of [
    ['gpt-6.2-astra', 'GPT-6.2 Astra', 272000],
    ['gpt-6.2-sol', 'GPT-6.2 Sol', 500000],
    ['gpt-6.1-sol', 'GPT-6.1 Sol', 500000],
  ]) {
    const oauth = catalog.providers['openai-codex-oauth'][id];
    assert.ok(oauth, `openai-codex-oauth/${id} must exist`);
    assert.equal(oauth.name, name);
    assert.equal(oauth.context, context,
      'the public Codex model list documents this default window; no authenticated discovery was run');
    assert.equal(oauth.image, true);
    assert.equal(oauth.reasoning, true);
    assert.equal(oauth.api, 'openai-codex-responses');
    for (const field of ['maxOutput', 'maxContext', 'thinkingLevels', 'thinkingLevelMap',
      'defaultThinkingLevel', 'serviceTiers', 'visionCapabilities']) {
      assert.equal(field in oauth, false,
        `${id}: ${field} has no independent source for the OAuth surface and must stay unset`);
    }
  }
});

test('Claude Fable 5.2 and Mythos 5.2 keep the 5.1 adaptive-only contract verbatim', () => {
  for (const [id, name, reference] of [
    ['claude-fable-5-2', 'Claude Fable 5.2', 'claude-fable-5-1'],
    ['claude-mythos-5-2', 'Claude Mythos 5.2', 'claude-mythos-5-1'],
  ]) {
    const entry = catalog.providers.anthropic[id];
    assert.ok(entry, `anthropic/${id} must exist`);
    const prior = catalog.providers.anthropic[reference];
    assert.equal(entry.name, name);
    for (const field of ['context', 'maxOutput', 'image', 'reasoning',
      'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel', 'compat']) {
      assert.deepEqual(entry[field], prior[field], `${id}.${field} must match ${reference}`);
    }
    assert.equal('requiresCapabilities' in entry, false,
      'the always-on adaptive profile is already in the frozen v1 vocabulary');
    assert.equal('xhigh' in entry, false, 'xhigh is a thinking level here, not the boolean flag');
  }
});

test('Gemini 4 Carbon, Hydrogen and Neon share the Argon shape and the three-level ladder', () => {
  for (const [id, name, level] of [
    ['gemini-4-carbon', 'Gemini 4 Carbon', 'medium'],
    ['gemini-4-hydrogen', 'Gemini 4 Hydrogen', 'high'],
    ['gemini-4-neon', 'Gemini 4 Neon', 'high'],
  ]) {
    const entry = catalog.providers.gemini[id];
    assert.ok(entry, `gemini/${id} must exist`);
    assert.equal(entry.name, name);
    assert.equal(entry.context, 1048576);
    assert.equal(entry.maxOutput, 65536,
      '65,536 is the default synchronous cap; long decode is not a plain maxOutput');
    for (const field of ['image', 'video', 'audio', 'reasoning']) {
      assert.equal(entry[field], true, field);
    }
    assert.deepEqual(entry.thinkingLevels, ['low', 'medium', 'high'],
      'the client google-thinking-level compat maps only these three levels; xhigh would fail');
    assert.equal(entry.defaultThinkingLevel, level);
    assert.deepEqual(entry.compat, { thinkingFormat: 'google-thinking-level' });
    assert.equal('api' in entry, false);
    assert.equal('visionCapabilities' in entry, false);
    assert.equal('requiresCapabilities' in entry, false);
  }
});

test('Mistral Large 4 records always-on reasoning without an invented output cap or effort ladder', () => {
  const entry = catalog.providers.mistral['mistral-large-4'];
  assert.ok(entry, 'mistral/mistral-large-4 must exist');
  assert.equal(entry.name, 'Mistral Large 4');
  assert.equal(entry.context, 1048576);
  assert.equal(entry.image, true);
  assert.equal(entry.reasoning, true);
  assert.equal('maxOutput' in entry, false, 'the reference documents no separate output cap');
  for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel', 'api', 'compat']) {
    assert.equal(field in entry, false,
      `${field} is unverified on the Mistral adapter and must stay unset`);
  }
});

test('the OpenRouter mirrors keep their established gateway wiring', () => {
  for (const [id, name] of [
    ['openai/gpt-6.2-astra', 'OpenAI GPT-6.2 Astra'],
    ['openai/gpt-6.2-sol', 'OpenAI GPT-6.2 Sol'],
  ]) {
    const router = catalog.providers.openrouter[id];
    assert.ok(router, `openrouter/${id} must exist`);
    assert.equal(router.name, name);
    assert.equal(router.context, 1050000);
    assert.equal(router.maxOutput, 128000);
    assert.equal(router.image, true);
    assert.equal(router.reasoning, true);
    assert.equal(router.api, 'openai-completions', 'the mirror keeps the GPT-6.1 Sol router wiring');
    assert.deepEqual(router.thinkingLevels, ['low', 'medium', 'high', 'max']);
    assert.equal(router.thinkingLevels.includes('off'), false, 'the underlying model rejects none');
    assert.deepEqual(router.thinkingLevelMap, { xhigh: 'max' });
    assert.equal(router.defaultThinkingLevel, 'medium');
    assert.equal('serviceTiers' in router, false);
    assert.equal('compat' in router, false);
  }

  const fable = catalog.providers.openrouter['anthropic/claude-fable-5.2'];
  assert.ok(fable, 'openrouter/anthropic/claude-fable-5.2 must exist');
  assert.equal(fable.name, 'Anthropic/Claude Fable 5.2');
  assert.equal(fable.context, 1000000);
  assert.equal(fable.maxOutput, 128000);
  assert.equal(fable.image, true);
  assert.equal(fable.reasoning, true);
  assert.equal(fable.xhigh, true);
  assert.deepEqual(fable.compat, {
    thinkingFormat: 'openrouter',
    reasoningProfile: 'openrouter-anthropic-adaptive',
  });
  assert.equal(catalog.providers.openrouter['anthropic/claude-mythos-5.2'], undefined,
    'the Mythos 5.2 mirror returned 404 on OpenRouter and must not be added');

  for (const [id, name, level] of [
    ['google/gemini-4-carbon', 'Google/Gemini 4 Carbon', 'medium'],
    ['google/gemini-4-hydrogen', 'Google/Gemini 4 Hydrogen', 'high'],
    ['google/gemini-4-neon', 'Google/Gemini 4 Neon', 'high'],
  ]) {
    const gateway = catalog.providers.openrouter[id];
    assert.ok(gateway, `openrouter/${id} must exist`);
    const native = catalog.providers.gemini[id.slice('google/'.length)];
    assert.equal(gateway.name, name);
    for (const field of ['context', 'maxOutput', 'image', 'video', 'audio',
      'reasoning', 'thinkingLevels', 'defaultThinkingLevel']) {
      assert.deepEqual(gateway[field], native[field], `${id}.${field} must mirror the native description`);
    }
    assert.equal(gateway.defaultThinkingLevel, level);
    assert.equal(gateway.api, 'openai-completions');
    assert.deepEqual(gateway.compat, { thinkingFormat: 'openrouter' },
      'the gateway must not carry the native google thinking format');
  }

  const mistral = catalog.providers.openrouter['mistralai/mistral-large-4-0'];
  assert.ok(mistral, 'openrouter/mistralai/mistral-large-4-0 must exist');
  assert.equal(mistral.name, 'Mistralai/Mistral Large 4.0');
  assert.equal(mistral.context, 1048576);
  assert.equal(mistral.maxOutput, 262144, 'the 262,144 output cap belongs only to the gateway');
  assert.equal(mistral.image, true);
  assert.equal(mistral.reasoning, true);
  for (const field of ['api', 'compat', 'thinkingLevels', 'serviceTiers']) {
    assert.equal(field in mistral, false, `gateway mistral entry must not carry ${field}`);
  }
});

test('the new generic fallbacks are descriptive only and carry no wire fields', () => {
  const expected = {
    'gpt-6.2-astra': { name: 'GPT-6.2 Astra', context: 1050000, maxOutput: 128000, image: true, reasoning: true },
    'gpt-6.2-sol': { name: 'GPT-6.2 Sol', context: 1050000, maxOutput: 128000, image: true, reasoning: true },
    'claude-fable-5-2': { name: 'Claude Fable 5.2', context: 1000000, maxOutput: 128000, image: true, reasoning: true },
    'claude-mythos-5-2': { name: 'Claude Mythos 5.2', context: 1000000, maxOutput: 128000, image: true, reasoning: true },
    'gemini-4-carbon': { name: 'Gemini 4 Carbon', context: 1048576, maxOutput: 65536, image: true, video: true, audio: true, reasoning: true },
    'gemini-4-hydrogen': { name: 'Gemini 4 Hydrogen', context: 1048576, maxOutput: 65536, image: true, video: true, audio: true, reasoning: true },
    'gemini-4-neon': { name: 'Gemini 4 Neon', context: 1048576, maxOutput: 65536, image: true, video: true, audio: true, reasoning: true },
    'mistral-large-4': { name: 'Mistral Large 4', context: 1048576, image: true, reasoning: true },
  };
  for (const [id, fields] of Object.entries(expected)) {
    const fallback = catalog.fallbacks[id];
    assert.ok(fallback, `fallbacks.${id} must exist`);
    assert.deepEqual(fallback, fields, `fallbacks.${id} shape`);
    for (const field of WIRE_FIELDS) {
      assert.equal(field in fallback, false, `fallbacks.${id} must not carry ${field}`);
    }
  }
});

test('the November curated defaults replace only the direct successors', () => {
  assert.deepEqual(catalog.defaults.openai, ['gpt-6.2-sol', 'gpt-6-sol', 'gpt-6-luna']);
  assert.deepEqual(catalog.defaults['openai-codex-oauth'], ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6.1-terra']);
  assert.deepEqual(catalog.defaults.anthropic, ['claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5']);
  assert.deepEqual(catalog.defaults.openrouter,
    ['google/gemini-4-argon', 'openai/gpt-6.2-sol', 'anthropic/claude-opus-5.5']);
  assert.deepEqual(catalog.defaults.gemini, ['gemini-4-argon', 'gemini-3.8-flash'],
    'the gemini list is unchanged by this batch');
  assert.deepEqual(catalog.defaults.mistral, ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    'the mistral list is unchanged by this batch');
  // The superseded entries stay reachable through their provider entries.
  for (const [provider, id] of [
    ['openai', 'gpt-6.1-sol'],
    ['openai-codex-oauth', 'gpt-6-sol'],
    ['openai-codex-oauth', 'gpt-6.1-sol'],
    ['anthropic', 'claude-fable-5-1'],
    ['openrouter', 'openai/gpt-6.1-sol'],
  ]) {
    assert.ok(catalog.providers[provider][id], `${provider}/${id} keeps its entry`);
    assert.equal(catalog.defaults[provider].includes(id), false,
      `${provider}/${id} left the three-model recommendation`);
  }
});

test('every November entry is ungated and survives the v1 projection', () => {
  const pairs = [
    ['openai', 'gpt-6.2-astra'], ['openai', 'gpt-6.2-sol'],
    ['openai-codex-oauth', 'gpt-6.2-astra'], ['openai-codex-oauth', 'gpt-6.2-sol'],
    ['openai-codex-oauth', 'gpt-6.1-sol'],
    ['anthropic', 'claude-fable-5-2'], ['anthropic', 'claude-mythos-5-2'],
    ['gemini', 'gemini-4-carbon'], ['gemini', 'gemini-4-hydrogen'], ['gemini', 'gemini-4-neon'],
    ['mistral', 'mistral-large-4'],
    ['openrouter', 'openai/gpt-6.2-astra'], ['openrouter', 'openai/gpt-6.2-sol'],
    ['openrouter', 'anthropic/claude-fable-5.2'],
    ['openrouter', 'google/gemini-4-carbon'], ['openrouter', 'google/gemini-4-hydrogen'],
    ['openrouter', 'google/gemini-4-neon'],
    ['openrouter', 'mistralai/mistral-large-4-0'],
  ];
  const fallbackIds = [
    'gpt-6.2-astra', 'gpt-6.2-sol', 'claude-fable-5-2', 'claude-mythos-5-2',
    'gemini-4-carbon', 'gemini-4-hydrogen', 'gemini-4-neon', 'mistral-large-4',
  ];
  for (const doc of [catalog, v1Catalog]) {
    for (const [provider, id] of pairs) {
      assert.ok(doc.providers[provider]?.[id],
        `schemaVersion ${doc.schemaVersion}: ${provider}/${id} must be present`);
      assert.equal('requiresCapabilities' in doc.providers[provider][id], false,
        `${provider}/${id} must not be gated`);
    }
    for (const id of fallbackIds) {
      assert.deepEqual(doc.fallbacks[id], catalog.fallbacks[id],
        `schemaVersion ${doc.schemaVersion}: fallbacks.${id} survives the projection`);
    }
    assert.deepEqual(doc.defaults['openai-codex-oauth'], ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6.1-terra'],
      `schemaVersion ${doc.schemaVersion}: curated order`);
  }
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(v1Catalog.schemaVersion, 1);
});
