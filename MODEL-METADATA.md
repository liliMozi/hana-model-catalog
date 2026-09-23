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

## September 23, 2026 additions

These additions preserve the existing schema and historical entries. Provider
availability and limits are reviewed separately from subscription entitlements.

| Provider/model | Confirmed metadata and source |
| --- | --- |
| Claude Opus 5.5 | Official ID `claude-opus-5-5`, released September 22. 1M context, 128K output (300K under the Batch API extended-output beta), text/image input, text output. Adaptive thinking is always on with no off choice, and the documented default effort is `medium`, unlike Fable 5.1's `high`. The entry keeps the five documented efforts low through max with the legacy xhigh mapping. The Opus 5 grounding coordinates are not carried over because the Opus 5.5 documentation does not confirm them, and image input alone does not establish grounding. Opus 5.5 Fast mode is a separately priced research preview and is not recorded as a service tier. [Model overview](https://platform.claude.com/docs/en/models/opus-5-5/overview), [models comparison](https://platform.claude.com/docs/en/models/overview). |
| OpenAI GPT-6 Sol / Luna | Official IDs `gpt-6-sol` and `gpt-6-luna`, released September 22. 1,050,000 context and 128,000 output, text/image input, text output. Both document `reasoning.effort` values none, low, medium (default), high, xhigh, and max on the Responses API, so the entries expose off/low/medium/high/xhigh/max with off mapped to none and medium as default. Fast mode is documented at 2x the applicable rate on the same model ID, recorded as the standard/fast service tiers. No Codex OAuth entitlement is inferred from API availability. [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). |
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
