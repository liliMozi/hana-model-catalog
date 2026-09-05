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
| OpenAI GPT-6 Astra | 1,050,000 context, 128,000 output, image input, five efforts from low through xhigh and max. [Model reference](https://developers.openai.com/api/docs/models/gpt-6-astra). Tools use Responses. Fast is a service tier on the same model ID; EU residency excludes Fast. [Migration guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra). |
| Codex OAuth GPT-6 Astra | Separate subscription surface. Official Codex model discovery reports 272,000 default context and 872,000 maximum context, medium default effort, and Fast. [Models](https://learn.chatgpt.com/docs/models), [Speed](https://learn.chatgpt.com/docs/agent-configuration/speed). Availability is account-dependent. Ultra is a Codex orchestration mode and is not advertised here as an API effort. |
| Claude Fable 5.1 / Mythos 5.1 | 1M context, 128k output, text/image input, always-on adaptive thinking, high default. Mythos requires invitation. [Release notes](https://platform.claude.com/docs/en/release-notes/overview), [Fable specifications](https://platform.claude.com/docs/en/models/fable-5-1/overview). |
| Claude Opus 4.8 / current Claude 5 families | Opus 4.8 has 1M context and 128k output. [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows). Fable/Mythos 5 and 5.1, Opus 5/4.8, and Sonnet 5 support distinct low, medium, high, xhigh, max efforts. [Effort reference](https://platform.claude.com/docs/en/build-with-claude/effort). |
| Gemini 3.8 Flash | 1,048,576 input, 65,536 output, text/image/video/audio input. [Model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Only low, medium, high efforts are documented, with medium default. [Thinking](https://ai.google.dev/gemini-api/docs/thinking). |
| Qwen 3.8 Max / Flash | 1M context, 131,072 output, text/image/video input. Max snapshot IDs 0902 and 2026-09-02 are both documented. [Max](https://help.aliyun.com/en/model-studio/qwen3-8-max), [Flash](https://help.aliyun.com/en/model-studio/qwen3-8-flash). Hybrid thinking uses enable_thinking. [Thinking guide](https://help.aliyun.com/en/model-studio/deep-thinking). Token-plan availability is a separate contract and is not inferred from these API entries. |
| MiniMax M3 | Corrected context from 500,000 to 1,000,000 and added video input, preserving existing output metadata. [Model invocation](https://platform.minimax.io/docs/guides/text-generation). |
| DeepSeek V4 | Current Flash, Pro and Flash Vision Exp IDs and 1M/384k limits already exist in this catalog. [Model details](https://api-docs.deepseek.com/quick_start/pricing/). |
| GLM 5.3 | Existing text-only 1M/128k metadata and low/high/max choices match the [official reference](https://docs.z.ai/guides/llm/glm-5.3). |

## Boundaries requiring runtime support

Kimi K3 and K2.7 Code are listed by the [official model directory](https://platform.kimi.ai/docs/models). K3 replaces K2's thinking object with top-level reasoning_effort and requires preserved reasoning_content; [reasoning reference](https://platform.kimi.ai/docs/guide/use-reasoning-effort). Do not copy K2 compatibility settings onto K3. Model-directory availability alone is not proof of Hana request compatibility.

Existing historical entries remain addressable for old configurations. A
source-backed correction to a frozen baseline field must name the exact old
and new values in the baseline cross-check; never regenerate the historical
fixture or weaken checks for unrelated fields.
