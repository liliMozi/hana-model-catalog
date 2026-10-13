# Model metadata maintenance

The catalog describes provider/model pairs, not account entitlements. A model
may require a subscription, regional availability, or invitation. Verify each
provider surface separately; do not copy API limits to a coding subscription
or advertise a new model ID merely because a related model exists.

Use exact documented IDs and token counts. Add only confirmed modalities and
protocol fields. Image input alone does not establish grounding coordinates.
Reasoning support does not imply every effort value is accepted; leave missing
information unspecified. Generic fallbacks contain descriptive metadata only.

## Current reference entries

Reviewed September 5, 2026. Links are authoring documentation and are excluded
from the compiled artifact.

| Provider/model | Confirmed metadata and source |
| --- | --- |
| OpenAI GPT-6 Astra | 1,050,000 context, 128,000 output, image input, five efforts from low through xhigh and max. [Model reference](https://developers.openai.com/api/docs/models/gpt-6-astra). The API default effort is left unspecified; the Codex default is not copied to the API surface. Tools use Responses. Fast is a service tier on the same model ID; EU residency excludes Fast. [Migration guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra). |
| Codex OAuth GPT-6 Astra | Separate subscription surface. Official Codex model discovery reports 272,000 default context and 872,000 maximum context, medium default effort, and Fast. [Models](https://learn.chatgpt.com/docs/models), [Speed](https://learn.chatgpt.com/docs/agent-configuration/speed). Availability is account-dependent. Ultra is a Codex orchestration mode and is not advertised here as an API effort. |
| Claude Fable 5.1 / Mythos 5.1 | 1M context, 128k output, text/image input, always-on adaptive thinking, high default. Mythos requires invitation. [Release notes](https://platform.claude.com/docs/en/release-notes/overview), [Fable specifications](https://platform.claude.com/docs/en/models/fable-5-1/overview). |
| Claude Opus 4.8 / current Claude 5 families | Opus 4.8 has 1M context and 128k output. [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows). Fable/Mythos 5 and 5.1, Opus 5/4.8, and Sonnet 5 support distinct low, medium, high, xhigh, max efforts. [Effort reference](https://platform.claude.com/docs/en/build-with-claude/effort). |
| Gemini 3.8 Flash | 1,048,576 input, 65,536 output, text/image/video/audio input. [Model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Only low, medium, high efforts are documented, with medium default. [Thinking](https://ai.google.dev/gemini-api/docs/thinking). |
| Qwen 3.8 Max / Flash | 1M context, 131,072 output, text/image/video input. Max snapshot IDs 0902 and 2026-09-02 are both documented. [Max](https://help.aliyun.com/en/model-studio/qwen3-8-max), [Flash](https://help.aliyun.com/en/model-studio/qwen3-8-flash). Hybrid thinking uses enable_thinking. [Thinking guide](https://help.aliyun.com/en/model-studio/deep-thinking). Token-plan availability is a separate contract and is not inferred from these API entries. |
| MiniMax M3 | Retains the curated 500,000 context usability ceiling despite the officially advertised 1,000,000 maximum; this intentional limit is protected by the upstream-sync exclusion. Added verified video input and preserved output metadata. [Model invocation](https://platform.minimax.io/docs/guides/text-generation). |
| DeepSeek Flash | Reviewed September 11, 2026. Official API ID `deepseek-flash`, displayed as DeepSeek Flash, currently serves DeepSeek V4.1 Flash (released September 10). 1M context, 384k maximum output, text/image input; thinking can be disabled or set to low/high/max, with high as default. [Release announcement](https://deepseek.com/news/deepseek-v4-1-flash/), [Model details](https://api-docs.deepseek.com/quick_start/pricing/), [Thinking guide](https://api-docs.deepseek.com/guides/thinking_mode/). |
| Doubao Seed Evolving | Reviewed September 17, 2026. Unified rolling ID `doubao-seed-evolving` that always serves the latest Doubao version, focused on Agent and Coding scenarios. 1,048,576 context, 262,144 output, text/image/video input; a deep-thinking model. Available on the pay-as-you-go API and the Coding Plan subscription since August 21, 2026. [Model overview](https://www.volcengine.com/docs/82379/2549861), [Announcement feed](https://www.volcengine.com/docs/82379/1159178). |
| GLM 5.3 | Existing text-only 1M/128k metadata and low/high/max choices match the [official reference](https://docs.z.ai/guides/llm/glm-5.3). |

Opus 5, Sonnet 5, and Opus 4.8 retain an off choice. Sonnet 5 accepts disabled thinking; Opus 5 accepts it at high effort or below. Opus 4.8 starts with thinking off unless adaptive mode is configured. Fable/Mythos models reject disabled thinking. [Thinking configuration](https://platform.claude.com/docs/en/build-with-claude/thinking).

## October 14, 2026 additions: Gemini 4 Argon and curated initial default lists

Reviewed October 14, 2026. This batch adds two provider entries for Gemini 4
Argon and replaces every curated `defaults` list with a recommendation of at
most three models. It does not re-assert that any provider is globally
current. Provenance is split below: only what is marked "public source
reviewed this batch" was checked against official public documentation in this
pass; everything else reuses the verified records already collected in this
file or the provider partitions, or is an explicit empty list awaiting
verification.

### Gemini 4 Argon (public source reviewed this batch)

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Native Google `gemini-4-argon` | Official ID `gemini-4-argon`, stable. Input text/image/video/audio/PDF, output text. One unified window of 1,048,576 tokens shared by input, thinking and output, so `context` records the unified limit. The default synchronous output cap is 65,536 tokens; a single response can exceed it only through long decode (background execution with `max_output_tokens` above 65,536), a continuation mode that is not recorded as `maxOutput`. Thinking uses `thinking_level` with documented `low`, `medium` (default) and `high`, and no off choice. Recorded as `compat.thinkingFormat: "google-thinking-level"` — an authoring string the existing schema already permits; older clients parse the entry but do not act on the new format, so the new behavior depends on the matching client build. No grounding coordinates are recorded because the model page does not confirm them. [Model page](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon), [latest model](https://ai.google.dev/gemini-api/docs/latest-model?hl=en), [thinking](https://ai.google.dev/gemini-api/docs/thinking), [long decode](https://ai.google.dev/gemini-api/docs/long-decode). |
| OpenRouter `google/gemini-4-argon` | The public model API lists `google/gemini-4-argon` with `context_length` 1,048,576 and `max_completion_tokens` 65,536, text/image/audio/video/file input and text output. The gateway entry mirrors only the descriptive subset and the three thinking levels; its `compat.thinkingFormat` is `openrouter` and its `api` is `openai-completions`. The native `google-thinking-level` format is not copied onto the gateway and the native request parameters are not sent through it. No price fields and no paid invocation were used. [Public model API](https://openrouter.ai/api/v1/models). |

### Curated initial default lists

The `defaults` block is now a curated recommendation of at most three models
per provider, not a provider directory. Full candidate discovery is preserved
by the complete `providers/` tree and the discoverable providers; no provider
or model entry was removed in this batch.

Public sources reviewed this batch for the recommendations (this is not a
claim that each listed model is the account-wide latest):

- OpenAI — [models](https://developers.openai.com/api/docs/models): GPT-6 Astra is the current flagship, then GPT-6.1 Sol and GPT-6 Luna. Codex OAuth surface — [models](https://learn.chatgpt.com/docs/models): GPT-6.1 Sol, GPT-6 Sol and GPT-6 Luna, with GPT-5.5 retiring from Codex on October 14, 2026. GPT-6.1 Sol is not added to the Codex OAuth partition because its `context_window` / `max_context_window` / `minimal_client_version` have no public source yet.
- Anthropic — [models overview](https://platform.claude.com/docs/en/about-claude/models/overview): the current line is Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5. The recommendation stays within models whose protocols the current clients already carry; Sonnet 5.5 (released September 28, 2026) and Haiku 5.5 are not added and wait on a separate protocol review.
- DeepSeek — [models and pricing](https://api-docs.deepseek.com/quick_start/pricing/): `deepseek-flash` serves DeepSeek-V4.1-Flash and `deepseek-v4-pro` serves V4-Pro-0813; the legacy `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` names are retired.
- xAI — [release notes](https://docs.x.ai/developers/release-notes): Grok 4.7 (September 21), Grok 4.6 (August 12), Grok 4.5 (July 8).
- Alibaba DashScope — [models](https://help.aliyun.com/en/model-studio/models): Qwen3.8 Max, Qwen3.8 Flash and Qwen3.8 Omni Flash.
- Xiaomi MiMo — [model releases](https://mimo.mi.com/docs/zh-CN/updates/model): the V2.6 series (September 22); [deprecations](https://mimo.mi.com/docs/zh-CN/updates/deprecate): `mimo-v2.5-pro` and `mimo-v2.5` stop accepting requests on October 21, 2026.
- Moonshot / Kimi — [model list](https://platform.kimi.ai/docs/models): current models are Kimi K3, Kimi K2.7 Code and Kimi K2.6; Kimi K2.5, the Moonshot V1 series and the Kimi K2 series are discontinued.
- Zhipu — [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3) and [Coding Plan model switching](https://docs.z.ai/devpack/latest-model): GLM-5.3 and GLM-5.3-Flash are available on the Coding Plan for all tiers.
- MiniMax — [model invocation](https://platform.minimax.io/docs/guides/text-generation): MiniMax-M3 and M2.7 are current; MiniMax-M3.1-Flash-Preview is subscription-only and is not added.
- Groq — [supported models](https://console.groq.com/docs/models): production models include OpenAI GPT-OSS 120B/20B, Llama 3.3 70B and Llama 3.1 8B.

Lists not re-checked against official pages in this batch reuse the records
above or the provider partitions and must not be read as a fresh
verification: agnes, baichuan, baidu-cloud, dashscope-coding,
dashscope-token-plan, hunyuan, kimi-coding, mistral, modelscope, opencode-go,
perplexity, stepfun, volcengine, volcengine-coding.

Empty recommendations and their reasons:

- fireworks — the current official chat leaders (GLM 5.3, Kimi K3, Qwen 3.8 Max, Ember-1) have no adopted full serving ID or protocol evidence in this batch; older entries are not padded in.
- infini — no sufficient official model-list check this batch.
- siliconflow — the current official leaders (Kimi K3, GLM-5.3, DeepSeek-V4.1-Flash, Hy4-preview) are not present with adopted serving IDs; older entries are not padded in.
- together — the current official leaders (Kimi K3, GLM-5.3, Qwen3.8-2.4T-A95B) are not present with adopted serving IDs; older entries are not padded in.
- mimo-token-plan — the Token Plan partition carries only the V2.5 series, which stops serving October 21, 2026, and no V2.6 plan membership is verified yet.
- ollama — availability is determined by the user's local pulls; the connection keeps the on-device discovery directory and adds no curated cloud list.

`xai-oauth` has no verified partition or recommendation; no OAuth partition is
created from the xAI API models, so the client auto-adds nothing for it.

## September 30, 2026 additions

| Provider/model | Confirmed metadata and source |
| --- | --- |
| OpenAI GPT-6.1 Sol | Official ID `gpt-6.1-sol`, released September 30. 1,050,000 context, 128,000 maximum output, text/image input, text output. `reasoning.effort` accepts low, medium (default), high, xhigh, and max on the Responses API, and the reference explicitly states that `none` and `minimal` are not supported, so the entry exposes low/medium/high/xhigh/max with no off choice and medium as default. Tools use the Responses API; Chat Completions is documented without tool calling. Fast is a service tier on the same model ID, and EU data residency excludes Fast. [Model reference](https://developers.openai.com/api/docs/models/gpt-6.1-sol). |
| OpenRouter GPT-6.1 Sol mirror | Verified `openai/gpt-6.1-sol` against the public model API on September 30: 1,050,000 context, 128,000 completion cap, image input. The mirror retains the GPT-6 Sol router wiring with `openai-completions`, but the off choice is dropped because the underlying model rejects `none`. Native Responses and Codex wiring are not copied onto the gateway entry. [Public model API](https://openrouter.ai/api/v1/models). |
| Codex OAuth GPT-6.1 Sol | Not added. GPT-6.1 Sol is available in Codex in the desktop app and CLI ([model guide](https://learn.chatgpt.com/docs/models)), but no public source — the openai/codex repository or official documentation — states this partition's `context_window`, `max_context_window`, or `minimal_client_version`. The Codex catalog is delivered by the authenticated discovery endpoint, not a checked-in static list, so the entry waits on a verification call with an authenticated client before it is added. |

An `openai/gpt-6.1-sol-pro` ID is observable on the OpenRouter public model API
but has no official documentation. It is not added; the observation is recorded
here so a later review can decide whether to promote it.

## September 30, 2026 default-list gap backfill

The application's built-in default lists referenced these provider/model pairs
before the catalog carried them. Each entry records only officially documented
numbers; a pair without a published specification stays name-only.

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Anthropic `claude-haiku-3-5-20241022` | The same model as the existing `claude-3-5-haiku` alias: 200,000 context, 8,192 output, image input. [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview). |
| Baidu `ernie-4.5-turbo-vl-32k` | Visual-understanding ERNIE 4.5 Turbo VL: 32K context, 12,288 output, image input. [Model list](https://intl.cloud.baidu.com/en/doc/qianfan/s/7m95lyy43-intl-en). |
| Baidu `ernie-4.0-turbo-128k` | 128K context, 4,096 output. [Large-model API](https://ai.baidu.com/ai-doc/AISTUDIO/rm344erns). |
| DashScope coding `qwen3-coder-plus` / `qwen3-coder-flash` | 1,000,000 context, 65,536 output, text only. [Plus](https://help.aliyun.com/en/model-studio/qwen3-coder-plus), [Flash](https://help.aliyun.com/en/model-studio/qwen3-coder-flash). |
| DashScope coding `qwen3-coder-next` | 262,144 context, 65,536 output. [Model page](https://help.aliyun.com/en/model-studio/qwen3-coder-next). |
| Fireworks `accounts/fireworks/models/llama-v3p3-70b-instruct` | 131,072 context; function calling and image input are both documented as unsupported, so no output cap or modalities are recorded. [Model page](https://fireworks.ai/models/fireworks/llama-v3p3-70b-instruct). |
| Fireworks `accounts/fireworks/models/deepseek-r1` | 163,840 context, 32,768 generation cap, reasoning, no image input. [Model page](https://fireworks.ai/models/fireworks/deepseek-r1). |
| Groq `mixtral-8x7b-32768` | Retired March 20, 2025; only the ID's documented 32,768-token window is recorded, with no output cap. [Deprecations](https://console.groq.com/docs/deprecations). |
| Hunyuan `hunyuan-large-latest` | The current official model list no longer specifies this API ID; name-only. [Hunyuan overview](https://cloud.tencent.com/document/product/1729/104753). |
| Infini `deepseek-r1`, `deepseek-v3-0324` | The platform does not publish per-model serving limits; name-only. |
| ModelScope `Qwen/Qwen3-235B-A22B` | Qwen3 hybrid model: 128K context (131,072), 32,768 output, text input, reasoning. [Qwen3 release](https://qwenlm.github.io/zh/blog/qwen3/). |
| SiliconFlow `deepseek-ai/DeepSeek-V3-0324`, `Qwen/Qwen3-8B`, `THUDM/GLM-4-9B-0414`, `Pro/deepseek-ai/DeepSeek-R1` | Context windows 163,840 / 131,072 / 32,768 / 163,840 taken from the provider's model pages. Those pages report an output ceiling identical to the context window; as with the existing DeepSeek-V3.2 entry, that duplicate figure is not copied and output stays unspecified. [Model catalog](https://www.siliconflow.com/zh/models). |
| StepFun `step-1-flash` | No current official specification for this ID; name-only. |
| Volcengine `doubao-seed-code` | 256K context with visual understanding; no documented output cap. [Model list](https://www.volcengine.com/docs/82379/1553586). |
| Zhipu `glm-4-air` | GLM-4-Air-250414: 128K context, 16K output. [GLM-4 guide](https://docs.bigmodel.cn/cn/guide/models/text/glm-4). |
| MiniMax / MiMo Token Plan partitions | New `minimax-token-plan` (8 IDs) and `mimo-token-plan` (9 IDs) subscription surfaces. Each entry keeps its display name and inherits only the descriptive fields (context, max output, modality, reasoning) of the matching base-partition entry; no protocol field is added. [MiniMax Token Plan](https://platform.minimax.io/subscribe/token-plan), [MiMo Token Plan](https://mimo.mi.com/docs/zh-CN/price/token-plan). |

Subscription partitions may carry metadata, not just a display name: the
existing `dashscope-token-plan` `qwen3.8-max-preview` entry already ships a full
entry with context, output, modality, reasoning and its thinking ladder. For the
MiniMax and MiMo Token Plan partitions only descriptive fields are inherited,
for a second reason: a provider partition shadows the generic fallback, so a
name-only entry would silently drop the context, output, modality and reasoning
metadata that the fallback supplied before the partition existed. Inheriting the
descriptive subset restores that watermark and lets the curated 500,000 context
ceiling of MiniMax M3 propagate to the subscription surface. Wire contracts stay
with the provider plugin — no subscription-specific source justifies copying an
API thinking ladder onto these entries.

## September 24, 2026 additions

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Codex OAuth GPT-6 Sol / Luna | The September 23 batch added both IDs only to the OpenAI API surface; this batch adds them to `openai-codex-oauth` after verifying the live Codex model-discovery endpoint (`GET /backend-api/codex/models`, reviewed September 24). The endpoint filters by the caller's `client_version` against each model's own `minimal_client_version` (both models require 0.155.0), so stale clients silently see an older subset. Both models report `context_window` 272,000 and `max_context_window` 872,000, text/image input, five efforts low through max (Luna has no ultra), a medium default, and the Fast speed tier. Following the current convention for this partition's new entries, `context` records the declared maximum window (872,000) rather than the smaller product default, and `maxContext` is therefore omitted; the GPT-6 Astra entry retains its earlier default-window plus `maxContext` form. Ultra is a Codex orchestration mode and is not advertised as an effort. `maxOutput` is not reported by the endpoint; 128,000 follows the partition's existing entries and the API surface. `gpt-reserve` and `codex-auto-review` are `visibility: hide` internal models and are not added. [ChatGPT model guide](https://learn.chatgpt.com/docs/models). |

OpenAI announces that GPT-5.5 retires from ChatGPT, ChatGPT Work, and Codex
on October 14, 2026 (the API surface is unaffected). The Codex OAuth entries
for `gpt-5.5` remain until then; removal from this partition will drive the
corresponding client list cleanup. [Retirement notice](https://learn.chatgpt.com/docs/models).

## September 23, 2026 additions

These additions preserve the existing schema and historical entries. Provider
availability and limits are reviewed separately from subscription entitlements.

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Claude Opus 5.5 | Official ID `claude-opus-5-5`, released September 22. 1M context, 128K output (300K under the Batch API extended-output beta), text/image input, text output. Adaptive thinking is always on with no off choice, and the documented default effort is `medium`, unlike Fable 5.1's `high`. The entry keeps the five documented efforts low through max with the legacy xhigh mapping. The Opus 5 grounding coordinates are not carried over because the Opus 5.5 documentation does not confirm them, and image input alone does not establish grounding. Opus 5.5 Fast mode is a separately priced research preview and is not recorded as a service tier. [Model overview](https://platform.claude.com/docs/en/models/opus-5-5/overview), [models comparison](https://platform.claude.com/docs/en/models/overview). |
| OpenAI GPT-6 Sol / Luna | Official IDs `gpt-6-sol` and `gpt-6-luna`, released September 22. 1,050,000 context and 128,000 output, text/image input, text output. Both document `reasoning.effort` values none, low, medium (default), high, xhigh, and max on the Responses API, so the entries expose off/low/medium/high/xhigh/max with off mapped to none and medium as default. Fast mode is documented at 2x the applicable rate on the same model ID, recorded as the standard/fast service tiers. No Codex OAuth entitlement is inferred from API availability in this batch; the Codex surface is verified and added separately in the September 24 batch. [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). |
| OpenRouter mirrors | Verified `anthropic/claude-opus-5.5`, `openai/gpt-6-sol`, and `openai/gpt-6-luna` against the [public model API](https://openrouter.ai/api/v1/models) on September 23; all three report the native context and 128,000 completion caps with text/image input. The Opus 5.5 mirror retains the established OpenRouter Anthropic adaptive wiring used by Claude Opus 5, and the GPT-6 mirrors retain the GPT-5.6 router wiring with `openai-completions`; native Responses and Anthropic wire contracts are not copied onto gateway entries. |

Grok 4.7 was already recorded in the September 22 batch and is unchanged here.
The September 3 GPT-6 Astra entry is likewise unchanged; its documented effort
ladder starts at low, so it does not gain the off choice that Sol and Luna
explicitly document.

## September 22, 2026 additions

These additions preserve the existing schema and historical entries. Provider
availability and limits are reviewed separately from subscription entitlements.

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Xiaomi MiMo V2.6 | Official IDs `mimo-v2.6-pro`, `mimo-v2.6-flash`, and `mimo-v2.6-pro-ultraspeed`, released September 22 in the Chinese announcement. 1M context and 128K output; text/image/audio/video input, text output, reasoning and function calling. The existing Xiaomi binary token convention is retained as 1,048,576 / 131,072 and is corroborated by OpenRouter's numeric records. UltraSpeed is a separately documented API ID, with customized access on the official platform; inclusion does not imply account entitlement. [Release log](https://mimo.mi.com/docs/zh-CN/updates/model), [model specifications](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model), [announcement](https://mimo.mi.com/docs/zh-CN/news/latest/v2-6). No grounding coordinates or unverified effort controls are inferred from the multimodal capabilities. |
| xAI Grok 4.7 | Official ID `grok-4.7`, released September 21. 500,000 context, text/image input, text output; low/medium/high/xhigh efforts, high default. The official API declares no independent text-output limit, so `maxOutput` is omitted rather than invented. Grok 4.7 Fast is restricted to Cursor and Grok Build, not the public xAI API; no Fast model ID or service tier is added. Responses always returns encrypted reasoning, which callers must preserve unchanged; this data-only update does not implement a new replay protocol. [Model overview](https://docs.x.ai/developers/grok-4-7), [release notes](https://docs.x.ai/developers/release-notes). |
| GLM 5.3 FlashX | Official ID `glm-5.3-flashx`. Text/image/video input, text output, 1M context and 128K output, with the same text parameters as GLM 5.3. The existing official-provider convention remains 1,000,000 / 131,072. Thinking cannot be disabled; low/high/max choices retain the existing GLM Flash contract and recommended max. The official guide explicitly excludes FlashX from Coding Plan, so only the API surface is added. [Chinese model guide](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash), [English model guide](https://docs.z.ai/guides/vlm/glm-5.3-flash). |
| Qwen 3.8 Omni Flash | Official ID `qwen3.8-omni-flash`, with 1M context (the existing DashScope convention is 1,000,000), 131,072 output, text/image/audio/video input and text output. Supports function calling and reasoning. Its documented Chat Completions control is top-level `reasoning_effort`: low/medium/xhigh, default xhigh; minimal aliases low, high/max alias xhigh, and none disables thinking. The catalog exposes off/low/medium/high and explicitly maps high to the native xhigh, with high as the matching default; off maps to none. This preserves the supported schema's default-level vocabulary without inventing a new effort. `compat.supportsReasoningEffort` is explicit; no older Omni `enable_thinking` quirk is copied. The existing client still uses its provider adapter for video and the off switch; no paid API invocation was performed. No Coding Plan, Token Plan or Realtime entitlement is inferred. [Model specifications](https://help.aliyun.com/en/model-studio/qwen3-8-omni-flash), [thinking and invocation guide](https://help.aliyun.com/zh/model-studio/qwen-omni). |
| Doubao Seed 2.1 Pro 260915 | Exact snapshot `doubao-seed-2-1-pro-260915`, with 1024K context and 256K answer limit (1,048,576 / 262,144), multimodal understanding, reasoning and tool calling. The official model detail identifies it as the same model as the September 9 update of Seed Evolving. The dated snapshot is added only to the pay-as-you-go API; no new subscription snapshot ID is inferred. [Model list](https://www.volcengine.com/docs/82379/1593703), [model detail](https://ark.volcengine.com/region:cn-beijing/model/detail?name=doubao-seed-2-1-pro). GUI task support alone is not used to declare a coordinate format. |
| GPT Image 2.5 Sunburst / Flare | Official IDs `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare`, released September 8. Both accept text/image input and generate/edit images through the Image API or the Responses image-generation tool. They are registered as `type: image`, not chat models. Their low/medium/high/xhigh/max/auto quality options are image quality, not a chat thinking ladder; no token context/output limits are guessed. No Codex OAuth entitlement is inferred. [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [release notes](https://developers.openai.com/api/docs/changelog). |
| OpenRouter mirrors | Separately verified `xiaomi/mimo-v2.6-pro`, `xiaomi/mimo-v2.6-flash`, `xiaomi/mimo-v2.6-pro-ultraspeed`, `x-ai/grok-4.7`, and `z-ai/glm-5.3-flashx` against the [public model API](https://openrouter.ai/api/v1/models) on September 22. MiMo entries report 1,048,576 / 131,072 with text/image/audio/video input. Grok reports 500,000 / 450,000 with image input; that output cap belongs only to OpenRouter. FlashX reports 1,048,576 / 131,072 with image/video input. Do not copy raw-provider wire settings onto these gateway entries. |

Xiaomi announces that `mimo-v2.5-pro` and `mimo-v2.5` stop accepting requests
on October 21, 2026 at 10:00 Beijing time, with no automatic replacement.
Their historical entries remain addressable for existing configurations;
applications must select a supported replacement before shutdown.
[Shutdown notice](https://mimo.mi.com/docs/zh-CN/updates/deprecate).

Realtime voice models, restricted-access research models, and unrelated
third-party routing models are not added in this batch. Generic fallbacks
for the new IDs contain descriptive capabilities only, never provider-specific
reasoning, API selection or subscription settings.

## Boundaries requiring runtime support

Kimi K3 and K2.7 Code are listed by the [official model directory](https://platform.kimi.ai/docs/models). K3 replaces K2's thinking object with top-level reasoning_effort and requires preserved reasoning_content; [reasoning reference](https://platform.kimi.ai/docs/guide/use-reasoning-effort). Do not copy K2 compatibility settings onto K3. Model-directory availability alone is not proof of Hana request compatibility.

Existing historical entries remain addressable for old configurations. Check
the upstream-sync exclusions before changing existing metadata: some limits
are deliberately conservative based on practical usability. The historical
baseline fixture and its field-level checks must remain unchanged.

The official DeepSeek API temporarily routes `deepseek-v4-flash` and
`deepseek-v4-flash-vision-exp` to V4.1 Flash. Use `deepseek-flash` for its
current capabilities; the historical V4 entries remain unchanged for baseline
compatibility and do not describe the new alias targets. The announced V4 Pro
redirect starts September 14, 2026 at 12:00 Beijing time and is not yet in
effect at this review. This update does not change third-party provider IDs
or infer native grounding support from image input.
