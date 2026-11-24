import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog, v1Catalog } = buildCatalog(root, { publishedAt: '2026-11-25T00:00:00Z' });

const WIRE_FIELDS = [
  'api', 'compat', 'thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
  'visionCapabilities', 'maxContext', 'serviceTiers', 'legacyCompatibility',
  'requiresCapabilities', 'quirks',
];

test('Qwen 4 Max mirrors the Qwen 3.8 Max shape on the API and Token Plan partitions', () => {
  for (const provider of ['dashscope', 'dashscope-token-plan']) {
    const entry = catalog.providers[provider]['qwen4-max'];
    assert.ok(entry, `${provider}/qwen4-max must exist`);
    assert.equal(entry.name, 'Qwen 4 Max');
    assert.equal(entry.context, 1000000);
    assert.equal(entry.maxOutput, 131072);
    assert.equal(entry.image, true);
    assert.equal(entry.video, true);
    assert.equal(entry.reasoning, true);
    assert.deepEqual(entry.quirks, ['enable_thinking']);
    for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel', 'compat']) {
      assert.equal(field in entry, false,
        `${provider}/qwen4-max documents no effort ladder in this batch`);
    }
  }
});

test('Ling 3.1 Flash is a text-only thinking model on DashScope', () => {
  const ling = catalog.providers.dashscope['antdigital/Ling-3.1-flash'];
  assert.ok(ling, 'dashscope/antdigital/Ling-3.1-flash must exist');
  assert.equal(ling.name, 'Ling 3.1 Flash');
  assert.equal(ling.context, 1048576);
  assert.equal(ling.maxOutput, 262144);
  assert.equal(ling.reasoning, true);
  assert.deepEqual(ling.quirks, ['enable_thinking']);
  for (const field of ['image', 'video', 'audio']) {
    assert.equal(field in ling, false, `${field} is not a documented input modality`);
  }
});

test('GLM-5.4 lands on the Coding Plan partition only and keeps the 5.3 contract shape', () => {
  const entry = catalog.providers['zhipu-coding']['glm-5.4'];
  assert.ok(entry, 'zhipu-coding/glm-5.4 must exist');
  assert.equal(entry.name, 'GLM-5.4');
  assert.equal(entry.context, 1000000);
  assert.equal(entry.maxOutput, 131072);
  assert.equal(entry.image, true);
  assert.equal(entry.video, true);
  assert.equal(entry.reasoning, true);
  assert.equal(entry.xhigh, true);
  assert.deepEqual(entry.thinkingLevels, ['low', 'high', 'max']);
  assert.equal(entry.defaultThinkingLevel, 'max');
  assert.equal(catalog.providers.zhipu['glm-5.4'], undefined,
    'the public API waits for a security review; no zhipu API entry is fabricated');
});

test('MiniMax M3.1 Flash keeps the curated 500k ceiling and no output cap on both partitions', () => {
  for (const provider of ['minimax', 'minimax-token-plan']) {
    const entry = catalog.providers[provider]['MiniMax-M3.1-Flash'];
    assert.ok(entry, `${provider}/MiniMax-M3.1-Flash must exist`);
    assert.equal(entry.name, 'MiniMax M3.1 Flash');
    assert.equal(entry.context, 500000,
      'inherits the M3 curated usability ceiling below the advertised 1M');
    assert.equal(entry.image, true);
    assert.equal(entry.video, true);
    assert.equal(entry.reasoning, true);
    assert.equal('maxOutput' in entry, false,
      'the vendor documents no output cap for M3.1 Flash');
  }
});

test('the MiMo Token Plan partition inherits the descriptive subset of the v2.6 entries', () => {
  for (const id of ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed']) {
    const plan = catalog.providers['mimo-token-plan'][id];
    const base = catalog.providers.mimo[id];
    assert.ok(plan, `mimo-token-plan/${id} must exist`);
    assert.deepEqual(plan, base,
      `${id} inherits the descriptive fields of the mimo entry verbatim`);
    for (const field of ['api', 'compat', 'thinkingLevels', 'quirks']) {
      assert.equal(field in plan, false, `mimo-token-plan/${id} must not carry ${field}`);
    }
  }
});

test('the domestic OpenRouter mirrors are descriptive and keep no protocol fields', () => {
  const expected = {
    'qwen/qwen4-max': { context: 1000000, maxOutput: 131072, image: true, video: true, reasoning: true },
    'minimax/minimax-m3.1-flash': { context: 1048576, image: true, video: true, reasoning: true },
    'moonshotai/kimi-k3.1-pro': { context: 1048576, image: true, video: true, reasoning: true },
    'deepseek/deepseek-v4.1-flash-1017': { context: 1048576, maxOutput: 384000, image: true, reasoning: true },
    'inclusionai/ling-3.1-flash': { context: 1048576, maxOutput: 262144, reasoning: true },
  };
  for (const [id, fields] of Object.entries(expected)) {
    const mirror = catalog.providers.openrouter[id];
    assert.ok(mirror, `openrouter/${id} must exist`);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(mirror[field], value, `openrouter/${id}.${field}`);
    }
    for (const field of ['api', 'compat', 'thinkingLevels', 'thinkingLevelMap',
      'defaultThinkingLevel', 'serviceTiers', 'quirks', 'visionCapabilities']) {
      assert.equal(field in mirror, false, `openrouter/${id} must not carry ${field}`);
    }
  }
  assert.equal('maxOutput' in catalog.providers.openrouter['minimax/minimax-m3.1-flash'], false,
    'no gateway-reported cap is promoted onto the mirror without a native source');
  assert.equal('maxOutput' in catalog.providers.openrouter['moonshotai/kimi-k3.1-pro'], false);
});

test('the new domestic generic fallbacks are descriptive only', () => {
  const expected = {
    'qwen4-max': { name: 'Qwen 4 Max', context: 1000000, maxOutput: 131072, image: true, video: true, reasoning: true },
    'glm-5.4': { name: 'GLM-5.4', context: 1000000, maxOutput: 131072, image: true, video: true, reasoning: true, xhigh: true },
    'MiniMax-M3.1-Flash': { name: 'MiniMax M3.1 Flash', context: 500000, image: true, reasoning: true, video: true },
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

test('the domestic curated defaults replace only retired or superseded picks', () => {
  assert.deepEqual(catalog.defaults.dashscope, ['qwen3.8-omni-flash', 'qwen4-max', 'qwen3.8-flash']);
  assert.deepEqual(catalog.defaults['dashscope-token-plan'], ['qwen4-max']);
  assert.deepEqual(catalog.defaults['zhipu-coding'], ['glm-5.4', 'glm-5.3', 'glm-5.3-flash']);
  assert.deepEqual(catalog.defaults.minimax, ['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  assert.deepEqual(catalog.defaults['minimax-token-plan'], ['MiniMax-M3.1-Flash']);
  assert.deepEqual(catalog.defaults['mimo-token-plan'],
    ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed']);
  // Superseded or retired ids keep their provider entries for existing selections.
  for (const [provider, id] of [
    ['dashscope', 'qwen3.8-max'],
    ['dashscope-token-plan', 'qwen3.8-max-preview'],
    ['zhipu-coding', 'glm-5.2'],
    ['minimax', 'MiniMax-M2.7'],
    ['minimax-token-plan', 'MiniMax-M3'],
  ]) {
    assert.ok(catalog.providers[provider][id], `${provider}/${id} keeps its entry`);
    assert.equal(catalog.defaults[provider].includes(id), false,
      `${provider}/${id} left the curated list`);
  }
});

test('every domestic addition is ungated and survives the v1 projection', () => {
  const pairs = [
    ['dashscope', 'qwen4-max'],
    ['dashscope', 'antdigital/Ling-3.1-flash'],
    ['dashscope-token-plan', 'qwen4-max'],
    ['zhipu-coding', 'glm-5.4'],
    ['minimax', 'MiniMax-M3.1-Flash'],
    ['minimax-token-plan', 'MiniMax-M3.1-Flash'],
    ['mimo-token-plan', 'mimo-v2.6-pro'],
    ['mimo-token-plan', 'mimo-v2.6-flash'],
    ['mimo-token-plan', 'mimo-v2.6-pro-ultraspeed'],
    ['openrouter', 'qwen/qwen4-max'],
    ['openrouter', 'minimax/minimax-m3.1-flash'],
    ['openrouter', 'moonshotai/kimi-k3.1-pro'],
    ['openrouter', 'deepseek/deepseek-v4.1-flash-1017'],
    ['openrouter', 'inclusionai/ling-3.1-flash'],
  ];
  for (const doc of [catalog, v1Catalog]) {
    for (const [provider, id] of pairs) {
      assert.ok(doc.providers[provider]?.[id],
        `schemaVersion ${doc.schemaVersion}: ${provider}/${id} must be present`);
      assert.equal('requiresCapabilities' in doc.providers[provider][id], false,
        `${provider}/${id} must not be gated`);
    }
    for (const id of ['qwen4-max', 'glm-5.4', 'MiniMax-M3.1-Flash']) {
      assert.deepEqual(doc.fallbacks[id], catalog.fallbacks[id],
        `schemaVersion ${doc.schemaVersion}: fallbacks.${id} survives the projection`);
    }
  }
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(v1Catalog.schemaVersion, 1);
});
