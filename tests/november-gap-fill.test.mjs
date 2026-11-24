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

// Section 4: StepFun gap fill.
test('Step 5 Preview and Step 3.7 Flash record their official windows', () => {
  const preview = catalog.providers.stepfun['step-5-preview'];
  assert.ok(preview, 'stepfun/step-5-preview must exist');
  assert.equal(preview.name, 'Step 5 Preview');
  assert.equal(preview.context, 1000000);
  assert.equal(preview.maxOutput, 65536, 'the spec sheet states a 64k output cap');
  for (const field of ['image', 'video', 'reasoning']) {
    assert.equal(preview[field], true, field);
  }
  for (const field of ['thinkingLevels', 'thinkingLevelMap', 'defaultThinkingLevel', 'compat', 'api']) {
    assert.equal(field in preview, false,
      'the StepFun adapter reasoning_effort wiring is unverified; the ladder stays unwritten');
  }

  const flash = catalog.providers.stepfun['step-3.7-flash'];
  assert.ok(flash, 'stepfun/step-3.7-flash must exist');
  assert.equal(flash.context, 262144);
  assert.equal('maxOutput' in flash, false, 'no output cap is documented');
  for (const field of ['image', 'video', 'reasoning']) {
    assert.equal(flash[field], true, field);
  }
});

test('Step 5 Preview leads the stepfun recommendation and the fallbacks are descriptive', () => {
  assert.deepEqual(catalog.defaults.stepfun, ['step-5-preview', 'step-3.5-flash', 'step-3']);
  for (const doc of [catalog, v1Catalog]) {
    assert.deepEqual(doc.fallbacks['step-5-preview'], {
      name: 'Step 5 Preview', context: 1000000, maxOutput: 65536,
      image: true, video: true, reasoning: true,
    }, `schemaVersion ${doc.schemaVersion}: step-5-preview fallback`);
    assert.deepEqual(doc.fallbacks['step-3.7-flash'], {
      name: 'Step 3.7 Flash', context: 262144,
      image: true, video: true, reasoning: true,
    }, `schemaVersion ${doc.schemaVersion}: step-3.7-flash fallback`);
    assert.ok(doc.providers.stepfun['step-5-preview']);
    assert.ok(doc.providers.stepfun['step-3.7-flash']);
  }
  assert.equal(catalog.providers['stepfun-plan'], undefined,
    'no Step Plan subscription partition is created in this batch');
});

// Section 5: OpenRouter backfill mirrors plus the two native Gemini additions.
test('the Claude Sonnet 5.5 and Fable 5.1 mirrors keep the Anthropic adaptive gateway wiring', () => {
  for (const [id, name] of [
    ['anthropic/claude-sonnet-5.5', 'Anthropic/Claude Sonnet 5.5'],
    ['anthropic/claude-fable-5.1', 'Anthropic/Claude Fable 5.1'],
  ]) {
    const mirror = catalog.providers.openrouter[id];
    assert.ok(mirror, `openrouter/${id} must exist`);
    assert.equal(mirror.name, name);
    assert.equal(mirror.context, 1000000);
    assert.equal(mirror.maxOutput, 128000);
    assert.equal(mirror.image, true);
    assert.equal(mirror.reasoning, true);
    assert.equal(mirror.xhigh, true);
    assert.deepEqual(mirror.compat, {
      thinkingFormat: 'openrouter',
      reasoningProfile: 'openrouter-anthropic-adaptive',
    });
  }
});

test('the descriptive backfill mirrors record endpoint-verified values only', () => {
  const expected = {
    'moonshotai/kimi-k3': { context: 1048576, image: true, video: true },
    'deepseek/deepseek-v4.1-flash': { context: 1048576, image: true },
    'z-ai/glm-5.3-prime': { context: 1000000, maxOutput: 131072 },
  };
  for (const [id, fields] of Object.entries(expected)) {
    const mirror = catalog.providers.openrouter[id];
    assert.ok(mirror, `openrouter/${id} must exist`);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(mirror[field], value, `openrouter/${id}.${field}`);
    }
    assert.equal(mirror.reasoning, true);
    for (const field of ['api', 'compat', 'thinkingLevels', 'quirks']) {
      assert.equal(field in mirror, false);
    }
  }
  for (const id of ['moonshotai/kimi-k3', 'deepseek/deepseek-v4.1-flash']) {
    assert.equal('maxOutput' in catalog.providers.openrouter[id], false,
      `${id}: per-endpoint completion caps differ, so none is recorded`);
  }
});

test('Gemini 3.6 Flash and 3.5 Flash Lite join native gemini and OpenRouter', () => {
  for (const [nativeId, mirrorId, name] of [
    ['gemini-3.6-flash', 'google/gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['gemini-3.5-flash-lite', 'google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite'],
  ]) {
    const native = catalog.providers.gemini[nativeId];
    assert.ok(native, `gemini/${nativeId} must exist`);
    assert.equal(native.name, name);
    assert.equal(native.context, 1048576);
    assert.equal(native.maxOutput, 65536);
    for (const field of ['image', 'video', 'audio', 'reasoning']) {
      assert.equal(native[field], true, field);
    }
    assert.deepEqual(native.thinkingLevels, ['low', 'medium', 'high']);
    assert.equal(native.defaultThinkingLevel, 'medium');
    assert.equal('compat' in native, false, 'same no-compat shape as gemini-3.8-flash');

    const mirror = catalog.providers.openrouter[mirrorId];
    assert.ok(mirror, `openrouter/${mirrorId} must exist`);
    assert.equal(mirror.api, 'openai-completions');
    assert.deepEqual(mirror.compat, { thinkingFormat: 'openrouter' });
    for (const field of ['context', 'maxOutput', 'image', 'video', 'audio',
      'reasoning', 'thinkingLevels', 'defaultThinkingLevel']) {
      assert.deepEqual(mirror[field], native[field], `${mirrorId}.${field} mirrors the native description`);
    }
  }
});

test('the backfilled fallbacks are descriptive and every section-5 entry survives v1', () => {
  for (const doc of [catalog, v1Catalog]) {
    for (const [id, name] of [
      ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
      ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite'],
    ]) {
      assert.deepEqual(doc.fallbacks[id], {
        name, context: 1048576, maxOutput: 65536,
        image: true, video: true, audio: true, reasoning: true,
      }, `schemaVersion ${doc.schemaVersion}: fallbacks.${id}`);
    }
    for (const id of [
      'anthropic/claude-sonnet-5.5', 'anthropic/claude-fable-5.1',
      'moonshotai/kimi-k3', 'deepseek/deepseek-v4.1-flash', 'z-ai/glm-5.3-prime',
      'google/gemini-3.6-flash', 'google/gemini-3.5-flash-lite',
    ]) {
      assert.ok(doc.providers.openrouter[id],
        `schemaVersion ${doc.schemaVersion}: openrouter/${id} must be present`);
      assert.equal('requiresCapabilities' in doc.providers.openrouter[id], false);
    }
    for (const id of ['gemini-3.6-flash', 'gemini-3.5-flash-lite']) {
      assert.ok(doc.providers.gemini[id], `schemaVersion ${doc.schemaVersion}: gemini/${id}`);
    }
  }
});
