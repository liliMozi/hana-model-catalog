import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { catalog } = buildCatalog(root, { publishedAt: '2026-10-13T19:45:00Z' });

// The exact curated default list for this batch. Every id but the two Argon
// entries (added in the same batch) is a pre-existing provider entry; the
// list is the curated recommendation, not a full provider directory.
const EXPECTED_DEFAULTS = {
  agnes: ['agnes-2.0-flash'],
  anthropic: ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5'],
  baichuan: ['Baichuan4-Turbo', 'Baichuan4-Air'],
  'baidu-cloud': ['ernie-4.5-turbo-vl-32k', 'ernie-4.5-128k'],
  dashscope: ['qwen3.8-omni-flash', 'qwen3.8-max', 'qwen3.8-flash'],
  'dashscope-coding': ['qwen3-coder-plus', 'qwen3-coder-next', 'qwen3-coder-flash'],
  'dashscope-token-plan': ['qwen3.8-max-preview'],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  fireworks: [],
  gemini: ['gemini-3.8-flash'],
  groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  hunyuan: ['hunyuan-t1-latest', 'hunyuan-turbos-latest'],
  infini: [],
  'kimi-coding': ['kimi-for-coding'],
  minimax: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
  'minimax-token-plan': ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5'],
  mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  mimo: ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed'],
  'mimo-token-plan': [],
  modelscope: ['Qwen/Qwen3-235B-A22B'],
  'opencode-go': ['glm-5.2'],
  moonshot: ['kimi-k2.6'],
  openai: ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna'],
  'openai-codex-oauth': ['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra'],
  openrouter: ['google/gemini-4-argon', 'openai/gpt-6.1-sol', 'anthropic/claude-opus-5.5'],
  perplexity: ['sonar-pro', 'sonar'],
  siliconflow: [],
  stepfun: ['step-3.5-flash', 'step-3'],
  together: [],
  volcengine: ['doubao-seed-evolving', 'doubao-seed-2-1-pro-260915'],
  'volcengine-coding': ['doubao-seed-code'],
  xai: ['grok-4.7', 'grok-4.6', 'grok-4.5'],
  zhipu: ['glm-5.3-flashx', 'glm-5.3', 'glm-5.3-flash'],
  'zhipu-coding': ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'],
  ollama: [],
};

// The complete provider identity set preserved by this batch. The source
// batch only adds two model entries; this set guards against accidental
// deletion of any provider partition (full per-model identity is reviewed by
// the git diff, not copied into a fixture here).
const EXPECTED_PROVIDERS = [
  'agnes', 'anthropic', 'baichuan', 'baidu-cloud', 'dashscope', 'dashscope-coding',
  'dashscope-token-plan', 'deepseek', 'fireworks', 'gemini', 'groq', 'hunyuan',
  'infini', 'kimi-coding', 'minimax', 'minimax-token-plan', 'mistral', 'mimo',
  'mimo-token-plan', 'modelscope', 'moonshot', 'ollama', 'openai-codex-oauth',
  'openai', 'opencode-go', 'openrouter', 'perplexity', 'siliconflow', 'stepfun',
  'together', 'volcengine-coding', 'volcengine', 'xai', 'zhipu-coding', 'zhipu',
];

test('defaults match the curated target exactly', () => {
  assert.deepEqual(catalog.defaults, EXPECTED_DEFAULTS);
});

test('every curated default list stays within three and points at a real chat entry', () => {
  for (const [provider, list] of Object.entries(catalog.defaults)) {
    assert.ok(Array.isArray(list), `${provider} must be an array`);
    assert.ok(list.length <= 3, `${provider} must not recommend more than three models`);
    assert.equal(new Set(list).size, list.length, `${provider} must not repeat an id`);
    for (const id of list) {
      const entry = catalog.providers[provider]?.[id];
      assert.ok(entry, `${provider}/${id} must exist in providers/`);
      assert.notEqual(entry.type, 'image', `${provider}/${id} must not be an image model`);
    }
  }
});

test('provider identity set is intact after the additions', () => {
  assert.deepEqual(Object.keys(catalog.providers).sort(), [...EXPECTED_PROVIDERS].sort());
  // Spot-check representative historical entries survived untouched.
  for (const [provider, id] of [
    ['gemini', 'gemini-2.5-pro'],
    ['openai', 'gpt-4o'],
    ['anthropic', 'claude-3-5-sonnet'],
    ['minimax', 'MiniMax-M2'],
    ['groq', 'mixtral-8x7b-32768'],
  ]) {
    assert.ok(catalog.providers[provider][id], `${provider}/${id} must be preserved`);
  }
});

test('native Argon remains described but is not recommended before compatible clients ship', () => {
  assert.deepEqual(catalog.defaults.gemini, ['gemini-3.8-flash']);
  assert.ok(catalog.providers.gemini['gemini-4-argon']);
  assert.equal(catalog.defaults.gemini.includes('gemini-4-argon'), false);
  assert.equal(catalog.defaults.openrouter.includes('google/gemini-4-argon'), true,
    'the separately verified gateway uses its existing protocol');
});

test('native Gemini 4 Argon uses the google thinking-level format with the documented window', () => {
  const argon = catalog.providers.gemini['gemini-4-argon'];
  assert.equal(argon.name, 'Gemini 4 Argon');
  assert.equal(argon.context, 1048576);
  // 65,536 is the default synchronous output cap; the 1M figure is long decode
  // (background/continuation) and must not be written as a plain maxOutput.
  assert.equal(argon.maxOutput, 65536);
  for (const field of ['image', 'video', 'audio', 'reasoning']) {
    assert.equal(argon[field], true, field);
  }
  assert.deepEqual(argon.thinkingLevels, ['low', 'medium', 'high']);
  assert.equal(argon.thinkingLevels.includes('off'), false, 'the official levels have no off choice');
  assert.equal(argon.defaultThinkingLevel, 'medium');
  assert.deepEqual(argon.compat, { thinkingFormat: 'google-thinking-level' });
  assert.equal('api' in argon, false, 'the native google entry carries no wire-api selector');
  assert.equal('maxContext' in argon, false);
  assert.equal('visionCapabilities' in argon, false, 'no confirmed grounding coordinates');
});

test('OpenRouter Gemini 4 Argon mirrors descriptive metadata but keeps the gateway protocol', () => {
  const native = catalog.providers.gemini['gemini-4-argon'];
  const gateway = catalog.providers.openrouter['google/gemini-4-argon'];
  assert.equal(gateway.name, 'Google/Gemini 4 Argon');
  for (const field of ['context', 'maxOutput', 'image', 'video', 'audio', 'reasoning', 'thinkingLevels', 'defaultThinkingLevel']) {
    assert.deepEqual(gateway[field], native[field], `${field} must mirror the native description`);
  }
  assert.equal(gateway.api, 'openai-completions');
  assert.deepEqual(gateway.compat, { thinkingFormat: 'openrouter' });
  assert.notEqual(gateway.compat.thinkingFormat, 'google-thinking-level',
    'the gateway must not carry the native google thinking format');
  assert.equal('maxContext' in gateway, false);
  assert.equal('visionCapabilities' in gateway, false);
});

test('OpenAI API and Codex OAuth partitions keep their own curated lists', () => {
  assert.deepEqual(catalog.defaults.openai, ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna']);
  assert.deepEqual(catalog.defaults['openai-codex-oauth'], ['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra']);
  for (const id of catalog.defaults.openai) {
    assert.ok(catalog.providers.openai[id], `openai/${id} exists`);
  }
  for (const id of catalog.defaults['openai-codex-oauth']) {
    assert.ok(catalog.providers['openai-codex-oauth'][id], `openai-codex-oauth/${id} exists`);
  }
  assert.equal(catalog.defaults['openai-codex-oauth'].includes('gpt-6.1-sol'), false,
    'GPT-6.1 Sol stays off the Codex OAuth surface until its numbers have a public source');
  assert.equal(catalog.providers['openai-codex-oauth']['gpt-6.1-sol'], undefined);
});

test('xai-oauth is not fabricated from the xAI API partition', () => {
  assert.equal(catalog.providers['xai-oauth'], undefined);
  assert.equal('xai-oauth' in catalog.defaults, false);
});

test('retired and non-chat entries stay out of the curated recommendations', () => {
  assert.equal(catalog.defaults.groq.includes('mixtral-8x7b-32768'), false,
    'mixtral-8x7b-32768 is retired and must not be recommended');
  for (const provider of ['mimo', 'mimo-token-plan']) {
    for (const id of catalog.defaults[provider]) {
      assert.equal(/tts/i.test(id), false, `${provider}/${id} is not a chat model`);
    }
    assert.equal(catalog.defaults[provider].includes('mimo-v2.5-pro'), false,
      'mimo-v2.5-pro stops accepting requests on 2026-10-21');
    assert.equal(catalog.defaults[provider].includes('mimo-v2.5'), false,
      'mimo-v2.5 stops accepting requests on 2026-10-21');
  }
});

test('providers without a verified current recommendation carry an empty list', () => {
  for (const provider of ['fireworks', 'infini', 'siliconflow', 'together', 'mimo-token-plan', 'ollama']) {
    assert.deepEqual(catalog.defaults[provider], [], `${provider} must stay an explicit empty list`);
  }
});
