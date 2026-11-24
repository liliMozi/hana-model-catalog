import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog, v1Catalog } = buildCatalog(root, { publishedAt: '2026-11-25T00:00:00Z' });

// Section 1: owner-curated Codex OAuth context for GPT-6.2 Astra.
test('the Codex OAuth GPT-6.2 Astra context is the curated 500,000', () => {
  const oauth = catalog.providers['openai-codex-oauth']['gpt-6.2-astra'];
  assert.equal(oauth.context, 500000,
    'owner decision matching the Terra 800,000 convention, not the 272,000 published default');
  for (const doc of [catalog, v1Catalog]) {
    assert.equal(doc.providers['openai-codex-oauth']['gpt-6.2-astra'].context, 500000,
      `schemaVersion ${doc.schemaVersion}: curated context survives the projection`);
  }
});

// Section 2: kimi-for-coding refresh to the K2.8 Preview contract.
test('kimi-for-coding reflects the K2.8 Preview spec from the official model table', () => {
  const entry = catalog.providers['kimi-coding']['kimi-for-coding'];
  assert.ok(entry, 'kimi-coding/kimi-for-coding must exist');
  assert.equal(entry.name, 'Kimi for Coding');
  assert.equal(entry.context, 1048576, 'the official page documents up to 1,048,576');
  assert.equal(entry.image, true);
  assert.equal(entry.video, true, 'the K2.8 row documents image and video input');
  assert.equal(entry.reasoning, true);
  assert.deepEqual(entry.thinkingLevels, ['off', 'low', 'high', 'max'],
    'off stays because thinking-off routes to the non-thinking K2.8 variant');
  assert.deepEqual(entry.thinkingLevelMap,
    { off: null, low: 'low', medium: 'high', high: 'high', xhigh: 'max' },
    'the existing map already matches the documented effort mapping');
  assert.equal(entry.defaultThinkingLevel, 'max', 'the K2.8 Preview default is max');
  assert.equal('compat' in entry, false,
    'the documented request parameter is top-level reasoning_effort — the K3 shape, no K2 thinking object');
  assert.equal('maxOutput' in entry, false,
    'the official page documents no separate output limit');
  assert.ok(entry.visionCapabilities, 'vision capabilities are retained');
});

test('kimi-for-coding-highspeed records the always-on K2.7 Code Highspeed', () => {
  const entry = catalog.providers['kimi-coding']['kimi-for-coding-highspeed'];
  assert.ok(entry, 'kimi-coding/kimi-for-coding-highspeed must exist');
  assert.equal(entry.name, 'Kimi for Coding Highspeed');
  assert.equal(entry.context, 262144);
  assert.equal(entry.image, true);
  assert.equal(entry.video, true);
  assert.equal(entry.reasoning, true);
  for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel',
    'compat', 'maxOutput', 'visionCapabilities']) {
    assert.equal(field in entry, false,
      `${field}: thinking is always on with no adjustable level, and no output cap is documented`);
  }
});

test('the kimi-for-coding pair mirrors into descriptive fallbacks and stays ungated in v1', () => {
  assert.deepEqual(catalog.fallbacks['kimi-for-coding'], {
    name: 'Kimi for Coding',
    context: 1048576,
    image: true,
    video: true,
    reasoning: true,
    visionCapabilities: catalog.providers['kimi-coding']['kimi-for-coding'].visionCapabilities,
  });
  assert.deepEqual(catalog.fallbacks['kimi-for-coding-highspeed'], {
    name: 'Kimi for Coding Highspeed',
    context: 262144,
    image: true,
    video: true,
    reasoning: true,
  });
  for (const doc of [catalog, v1Catalog]) {
    for (const id of ['kimi-for-coding', 'kimi-for-coding-highspeed']) {
      assert.ok(doc.providers['kimi-coding'][id],
        `schemaVersion ${doc.schemaVersion}: kimi-coding/${id} must be present`);
      assert.equal('requiresCapabilities' in doc.providers['kimi-coding'][id], false,
        'the K3 request shape already ships ungated on this partition');
      assert.deepEqual(doc.fallbacks[id], catalog.fallbacks[id]);
    }
  }
  assert.deepEqual(catalog.defaults['kimi-coding'], ['kimi-for-coding'],
    'the curated Kimi Coding list is unchanged');
});

// Section 3: Qwen 3.7 series on DashScope, Token Plan, Coding Plan and OpenRouter.
test('the Qwen 3.7 trio mirrors the qwen4-max shape on the API surface', () => {
  const expected = {
    'qwen3.7-max': { image: false, video: false },
    'qwen3.7-plus': { image: true, video: true },
    'qwen3.7-flash': { image: true, video: true },
  };
  for (const [id, mods] of Object.entries(expected)) {
    const entry = catalog.providers.dashscope[id];
    assert.ok(entry, `dashscope/${id} must exist`);
    assert.equal(entry.context, 1000000);
    assert.equal(entry.maxOutput, 131072,
      'the official page states 131,072 for all three — the 65,536 flash figure was a gateway cap');
    assert.equal(entry.reasoning, true);
    assert.deepEqual(entry.quirks, ['enable_thinking']);
    assert.equal('image' in entry, mods.image);
    assert.equal('video' in entry, mods.video);
  }
});

test('the Token Plan partition gains the five listed Qwen text models', () => {
  const expected = {
    'qwen4-max': { context: 1000000, maxOutput: 131072, image: true, video: true },
    'qwen3.8-max': { context: 1000000, maxOutput: 131072, image: true, video: true },
    'qwen3.8-flash': { context: 1000000, maxOutput: 131072, image: true, video: true },
    'qwen3.7-max': { context: 1000000, maxOutput: 131072 },
    'qwen3.7-plus': { context: 1000000, maxOutput: 131072, image: true, video: true },
    'qwen3.6-flash': { context: 1000000, maxOutput: 65536, image: true, video: true },
  };
  for (const [id, fields] of Object.entries(expected)) {
    const entry = catalog.providers['dashscope-token-plan'][id];
    assert.ok(entry, `dashscope-token-plan/${id} must exist`);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(entry[field], value, `dashscope-token-plan/${id}.${field}`);
    }
    assert.equal(entry.reasoning, true);
    assert.deepEqual(entry.quirks, ['enable_thinking']);
    for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel', 'compat']) {
      assert.equal(field in entry, false);
    }
  }
  for (const id of ['qwen4-max-preview', 'auto',
    'deepseek-v4.1-flash', 'deepseek-v4-pro', 'glm-5.3']) {
    assert.equal(catalog.providers['dashscope-token-plan'][id], undefined,
      `dashscope-token-plan/${id} is registered but out of scope`);
  }
});

test('qwen3.7-plus joins dashscope-coding as the plan\'s only qwen3.7/3.8 text model', () => {
  const entry = catalog.providers['dashscope-coding']['qwen3.7-plus'];
  assert.ok(entry, 'dashscope-coding/qwen3.7-plus must exist');
  assert.equal(entry.context, 1000000);
  assert.equal(entry.maxOutput, 131072);
  assert.equal(entry.image, true);
  assert.equal(entry.video, true);
  assert.equal(entry.reasoning, true);
  assert.deepEqual(entry.quirks, ['enable_thinking']);
  assert.equal(catalog.providers['dashscope-coding']['qwen3.7-max'], undefined,
    'the official Coding Plan list does not include qwen3.7-max');
});

test('the Qwen 3.7 OpenRouter mirrors record gateway-measured values', () => {
  const expected = {
    'qwen/qwen3.7-max': { maxOutput: 131072, image: false, video: false },
    'qwen/qwen3.7-plus': { maxOutput: 131072, image: true, video: false },
    'qwen/qwen3.7-flash': { maxOutput: 65536, image: true, video: true },
  };
  for (const [id, mods] of Object.entries(expected)) {
    const mirror = catalog.providers.openrouter[id];
    assert.ok(mirror, `openrouter/${id} must exist`);
    assert.equal(mirror.context, 1000000);
    assert.equal(mirror.maxOutput, mods.maxOutput);
    assert.equal('image' in mirror, mods.image,
      `${id}: the endpoint's declared input modalities decide`);
    assert.equal('video' in mirror, mods.video);
    assert.equal(mirror.reasoning, true);
    for (const field of ['api', 'compat', 'thinkingLevels', 'quirks']) {
      assert.equal(field in mirror, false);
    }
  }
});

test('the Qwen 3.7 fallbacks are descriptive and survive the v1 projection', () => {
  const expected = {
    'qwen3.7-max': { name: 'Qwen 3.7 Max', context: 1000000, maxOutput: 131072, reasoning: true },
    'qwen3.7-plus': { name: 'Qwen 3.7 Plus', context: 1000000, maxOutput: 131072, image: true, video: true, reasoning: true },
    'qwen3.7-flash': { name: 'Qwen 3.7 Flash', context: 1000000, maxOutput: 131072, image: true, video: true, reasoning: true },
  };
  for (const doc of [catalog, v1Catalog]) {
    for (const [id, fields] of Object.entries(expected)) {
      assert.deepEqual(doc.fallbacks[id], fields,
        `schemaVersion ${doc.schemaVersion}: fallbacks.${id}`);
      for (const field of ['api', 'compat', 'thinkingLevels', 'quirks', 'requiresCapabilities']) {
        assert.equal(field in doc.fallbacks[id], false);
      }
    }
  }
});
