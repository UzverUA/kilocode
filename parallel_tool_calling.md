# Parallel Native Tool Calling (Temporary, Sequential Implementation)

This document describes **exactly** how to enable OpenAI-style `parallel_tool_calls` for all native-tool models in KiloCode **in a minimal, temporary, and fully sequential way**.

It is written for an implementation LLM that **does not have this context loaded**. Follow the steps below literally. The goal is to:

1. Allow the model to emit **multiple tool calls per assistant turn** (protocol-level parallelism).
2. Keep **execution strictly sequential** (no concurrency, no changes to the tool executor).
3. Make the change **easy to revert** once an official implementation is ready.
4. **Do not touch the system prompt** in any way.
5. Avoid model-capability checks; simply **enable for all models** (the user will only use compatible models).

---

## 1. Current behavior (what the code does today)

### 1.1 Request metadata: `parallelToolCalls` is hardcoded to `false`

In the main task loop, `Task.attemptApiRequest()` builds the API metadata used when calling the provider:

- File: [`Task.ts`](src/core/task/Task.ts:3883)

Inside `Task.attemptApiRequest()`, near where `metadata: ApiHandlerCreateMessageMetadata` is created, there is currently a hard-coded constant:

```ts
// Parallel tool calls are disabled - feature is on hold
// Previously resolved from experiments.isEnabled(..., EXPERIMENT_IDS.MULTIPLE_NATIVE_TOOL_CALLS)
const parallelToolCallsEnabled = false

const metadata: ApiHandlerCreateMessageMetadata = {
	mode: mode,
	taskId: this.taskId,
	suppressPreviousResponseId: this.skipPrevResponseIdOnce,
	// Include tools and tool protocol when using native protocol and model supports it
	...(shouldIncludeTools
		? { tools: allTools, tool_choice: "auto", toolProtocol, parallelToolCalls: parallelToolCallsEnabled }
		: {}),
	projectId: (await kiloConfig)?.project?.id,
}
```

So the `parallelToolCalls` flag in metadata is **always `false`** and is explicitly commented as “feature is on hold”.

### 1.2 OpenRouter (Kilocode) overrides `parallel_tool_calls` to `false`

For the **Kilocode provider**, requests are routed through the OpenRouter-compatible handler:

- Factory: [`buildApiHandler()`](src/api/index.ts:143) returns [`KilocodeOpenrouterHandler`](src/api/providers/kilocode-openrouter.ts:25) when `apiProvider === "kilocode"`.
- [`KilocodeOpenrouterHandler`](src/api/providers/kilocode-openrouter.ts:25) extends [`OpenRouterHandler`](src/api/providers/openrouter.ts:79) and **inherits** its `createMessage()` implementation.

Inside [`OpenRouterHandler.createMessage()`](src/api/providers/openrouter.ts:174), the request params are built as `completionParams`. In that object, the field `parallel_tool_calls` is explicitly hardcoded to `false`:

```ts
const completionParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
	...this.getProviderParams(),
	model: modelId,
	messages,
	temperature: metadata?.temperature ?? this.options.temperature ?? 0.2,
	max_tokens: metadata?.maxTokens ?? this.options.maxTokens,
	// Ensure only one tool call at a time (current default)
	parallel_tool_calls: false,
	...(metadata?.tools
		? {
				tools: metadata.tools,
				tool_choice: metadata.tool_choice ?? "auto",
			}
		: {}),
}
```

This is the **real reason** the final request body still shows `"parallel_tool_calls": false`, even after you:

- Set `metadata.parallelToolCalls = true` in [`Task.attemptApiRequest()`](src/core/task/Task.ts:4093).
- Set `params.parallel_tool_calls = true` in [`addNativeToolCallsToParams()`](src/api/providers/kilocode/nativeToolCallHelpers.ts:23).

For Kilocode (OpenRouter path), `addNativeToolCallsToParams()` is **not used at all**; only `OpenRouterHandler.createMessage()` controls `parallel_tool_calls`.

### 1.3 Provider helper for other backends: `addNativeToolCallsToParams()`

There is a generic helper that augments OpenAI-compatible params for some other providers:

- File: [`nativeToolCallHelpers.ts`](src/api/providers/kilocode/nativeToolCallHelpers.ts:23)

```ts
export function addNativeToolCallsToParams<T extends OpenAI.Chat.ChatCompletionCreateParams>(
	params: T,
	options: ProviderSettings,
	metadata?: ApiHandlerCreateMessageMetadata,
): T {
	// When toolStyle is "native" and allowedTools exist, add them to params
	if (resolveToolProtocol(options) === "native" && metadata?.tools) {
		params.tools = metadata.tools
		//optimally we'd have tool_choice as 'required', but many providers, especially
		// those using SGlang dont properly handle that setting and barf with a 400.
		params.tool_choice = "auto" as const
		params.parallel_tool_calls = false
	}

	return params
}
```

This helper is used by some non-OpenRouter providers (e.g., DeepInfra, Inception, LM Studio). It is **not** in the Kilocode/OpenRouter call path. Changing it is harmless for our purposes, but **it does not fix** the issue for the Kilocode provider; we must also change [`OpenRouterHandler.createMessage()`](src/api/providers/openrouter.ts:174).

### 1.3 Parsing/execution already supports multiple tool calls per turn

The rest of the stack is already designed to handle **multiple tool calls in one assistant response**:

- Native tool call streaming/parsing is handled by [`NativeToolCallParser`](src/core/assistant-message/NativeToolCallParser.ts:48).
    - It tracks multiple tool calls concurrently (by index and id) and emits events (`tool_call_start`, `tool_call_delta`, `tool_call_end`).
- The main task loop in [`Task.recursivelyMakeClineRequests()`](src/core/task/Task.ts:2289) uses these events to:
    - Append multiple `tool_use`/`mcp_tool_use` blocks to `this.assistantMessageContent`.
    - Call `presentAssistantMessage(this)` each time, which is responsible for **executing tools sequentially** and populating `this.userMessageContent`.

Crucially:

- Execution is already **sequential**. Even if multiple tool calls are present in a single assistant turn, the tools are executed one-by-one in the order they appear in `assistantMessageContent`.
- We **do not need to change** any of this to fulfill the user’s requirements.

Our job is only to allow the model to **emit** multiple tool calls at the API protocol level by turning on `parallel_tool_calls`.

---

## 2. Requirements for this temporary implementation

From the user’s constraints, the implementation must:

1. **Enable `parallel_tool_calls` for all native-tool calls**, without checking model capabilities.
    - This is intentionally “dumb”: assume the user will only select compatible models.
2. **Keep tool execution sequential**.
    - Do NOT introduce any concurrency (no `Promise.all` in tool handlers, no worker pools, etc.).
3. Be **easy to revert** later.
    - Changes should be localized and tagged with clear comments.
    - No large-scale refactors.
4. **Do not change the system prompt**.
    - No modifications to [`SYSTEM_PROMPT`](src/core/task/Task.ts:3688) or prompt templates.
5. **Ignore concurrent execution designs**.
    - Parallel execution (in the sense of true concurrency) is explicitly out of scope for now.

---

## 3. High-level approach

We will make **three small, explicit changes** (two already done, one missing piece for Kilocode):

1. **In `Task.attemptApiRequest()`**, hardcode `parallelToolCallsEnabled = true` and keep wiring it into `metadata.parallelToolCalls`.
2. **In `addNativeToolCallsToParams()`**, hardcode `params.parallel_tool_calls = true` when native tools are used (affects some non-OpenRouter providers; optional but consistent).
3. **In `OpenRouterHandler.createMessage()`**, hardcode `completionParams.parallel_tool_calls = true` for Kilocode/OpenRouter requests.

We will also tag both changes with a consistent comment marker, for example:

```ts
// kilocode_temp_parallel_tool_calls
```

This makes it trivial to revert: search for this marker and undo or flip the values.

We explicitly **do not**:

- Touch `presentAssistantMessage`.
- Modify `NativeToolCallParser`.
- Change the system prompt or any prompt text.
- Add capability detection logic for models.

---

## 4. Detailed implementation steps

### 4.1 Enable `parallelToolCalls` in Task metadata

**File:** [`Task.ts`](src/core/task/Task.ts:3883)

**Goal:** in `Task.attemptApiRequest()`, change the hard-coded `parallelToolCallsEnabled` from `false` to `true`, and tag the change.

#### 4.1.1 Locate the existing code

Search in `Task.attemptApiRequest()` for the comment:

```ts
// Parallel tool calls are disabled - feature is on hold
```

You should see code like this (context shown):

```ts
// Parallel tool calls are disabled - feature is on hold
// Previously resolved from experiments.isEnabled(..., EXPERIMENT_IDS.MULTIPLE_NATIVE_TOOL_CALLS)
const parallelToolCallsEnabled = false

const metadata: ApiHandlerCreateMessageMetadata = {
	mode: mode,
	taskId: this.taskId,
	suppressPreviousResponseId: this.skipPrevResponseIdOnce,
	// Include tools and tool protocol when using native protocol and model supports it
	...(shouldIncludeTools
		? { tools: allTools, tool_choice: "auto", toolProtocol, parallelToolCalls: parallelToolCallsEnabled }
		: {}),
	projectId: (await kiloConfig)?.project?.id, // kilocode_change: pass projectId for backend tracking (ignored by other providers)
}
```

#### 4.1.2 Replace with the hardcoded-enabled version

Modify this block to the following:

```ts
// Parallel tool calls temporarily enabled for all models.
// kilocode_temp_parallel_tool_calls: hardcoded to true as a minimal, reversible change.
const parallelToolCallsEnabled = true

const metadata: ApiHandlerCreateMessageMetadata = {
	mode: mode,
	taskId: this.taskId,
	suppressPreviousResponseId: this.skipPrevResponseIdOnce,
	// Include tools and tool protocol when using native protocol and model supports it
	...(shouldIncludeTools
		? { tools: allTools, tool_choice: "auto", toolProtocol, parallelToolCalls: parallelToolCallsEnabled }
		: {}),
	projectId: (await kiloConfig)?.project?.id, // kilocode_change: pass projectId for backend tracking (ignored by other providers)
}
```

Notes:

- We keep the `metadata.parallelToolCalls` field; we just make sure it is always `true` for now.
- The `kilocode_temp_parallel_tool_calls` marker is important for later revert.
- No other behavior is changed in `Task.attemptApiRequest()`.

### 4.2 Enable `params.parallel_tool_calls` in generic native tool helper (non-OpenRouter providers)

**File:** [`nativeToolCallHelpers.ts`](src/api/providers/kilocode/nativeToolCallHelpers.ts:23)

**Goal:** set the OpenAI request parameter `parallel_tool_calls` to `true` for all native tool requests that go through this helper. This does **not** affect the Kilocode/OpenRouter provider directly, but keeps behavior consistent across other backends.

#### 4.2.1 Locate the existing helper

Search for the `addNativeToolCallsToParams` function. You should see:

```ts
export function addNativeToolCallsToParams<T extends OpenAI.Chat.ChatCompletionCreateParams>(
	params: T,
	options: ProviderSettings,
	metadata?: ApiHandlerCreateMessageMetadata,
): T {
	// When toolStyle is "native" and allowedTools exist, add them to params
	if (resolveToolProtocol(options) === "native" && metadata?.tools) {
		params.tools = metadata.tools
		//optimally we'd have tool_choice as 'required', but many providers, especially
		// those using SGlang dont properly handle that setting and barf with a 400.
		params.tool_choice = "auto" as const
		params.parallel_tool_calls = false
	}

	return params
}
```

#### 4.2.2 Replace with the hardcoded-enabled version

Change the inner `if` block to:

```ts
// When toolStyle is "native" and allowedTools exist, add them to params
if (resolveToolProtocol(options) === "native" && metadata?.tools) {
	params.tools = metadata.tools
	//optimally we'd have tool_choice as 'required', but many providers, especially
	// those using SGlang dont properly handle that setting and barf with a 400.
	params.tool_choice = "auto" as const

	// Enable OpenAI-style parallel tool calls at the protocol level for all models.
	// kilocode_temp_parallel_tool_calls: temporary hardcoded behavior matching Task.attemptApiRequest.
	params.parallel_tool_calls = true
}
```

Notes:

- We **do not** inspect `metadata.parallelToolCalls` here; the requirement is to hardcode the setting for all models that use this helper.
- This keeps the change extremely local and easy to undo.
- This change **does not** affect Kilocode’s OpenRouter path, which builds params separately in [`OpenRouterHandler.createMessage()`](src/api/providers/openrouter.ts:174). That is handled in the next step.

### 4.3 Enable `completionParams.parallel_tool_calls` in OpenRouter (Kilocode) handler

**File:** [`openrouter.ts`](src/api/providers/openrouter.ts:174)

**Goal:** ensure the final HTTP request body for Kilocode (via OpenRouter) sets `"parallel_tool_calls": true` by changing the `completionParams` object in `OpenRouterHandler.createMessage()`.

#### 4.3.1 Locate the `completionParams` construction

In [`OpenRouterHandler.createMessage()`](src/api/providers/openrouter.ts:174), find the block where `completionParams` is defined. It will look similar to this:

```ts
const completionParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
	...this.getProviderParams(),
	model: modelId,
	messages,
	temperature: metadata?.temperature ?? this.options.temperature ?? 0.2,
	max_tokens: metadata?.maxTokens ?? this.options.maxTokens,
	// Ensure only one tool call at a time (current default)
	parallel_tool_calls: false,
	...(metadata?.tools
		? {
				tools: metadata.tools,
				tool_choice: metadata.tool_choice ?? "auto",
			}
		: {}),
}
```

This is the place that currently forces `parallel_tool_calls` to `false` for all OpenRouter-based requests, including Kilocode.

#### 4.3.2 Replace with the hardcoded-enabled version

Modify just the `parallel_tool_calls` line and add a comment marker for easy reversion:

```ts
  // Enable OpenAI-style parallel tool calls for all OpenRouter-based requests.
  // kilocode_temp_parallel_tool_calls: temporary hardcoded behavior matching Task.attemptApiRequest.
  parallel_tool_calls: true,
```

The final `completionParams` snippet should look like:

```ts
const completionParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
	...this.getProviderParams(),
	model: modelId,
	messages,
	temperature: metadata?.temperature ?? this.options.temperature ?? 0.2,
	max_tokens: metadata?.maxTokens ?? this.options.maxTokens,
	// Enable OpenAI-style parallel tool calls for all OpenRouter-based requests.
	// kilocode_temp_parallel_tool_calls: temporary hardcoded behavior matching Task.attemptApiRequest.
	parallel_tool_calls: true,
	...(metadata?.tools
		? {
				tools: metadata.tools,
				tool_choice: metadata.tool_choice ?? "auto",
			}
		: {}),
}
```

Notes:

- We intentionally ignore `metadata.parallelToolCalls` here and just hardcode `true` for simplicity and consistency with the temporary design.
- This is the **critical missing piece** for Kilocode: without this change, the final request body will continue to show `"parallel_tool_calls": false`.
- The `kilocode_temp_parallel_tool_calls` marker keeps this easy to find and revert later.

---

## 5. What we explicitly do _not_ change

To satisfy the user’s constraints and keep this change minimal, **do not touch** the following areas:

1. **System prompt / mode prompts**

    - Do not edit `SYSTEM_PROMPT` or any prompt-related code.
    - The user will manually adjust prompting as needed.

2. **Tool execution order or concurrency**

    - Do not modify `presentAssistantMessage` or any tool executor logic.
    - Do not introduce `Promise.all` or parallel execution for tools.
    - Execution must remain strictly sequential, as it already is.

3. **Tool parsing logic**

    - Do not change [`NativeToolCallParser`](src/core/assistant-message/NativeToolCallParser.ts:48).
    - Do not alter how `tool_call_partial` or `tool_call` chunks are processed.

4. **Mode/mcp/tool definitions**
    - Do not change how tools are defined or filtered.
    - No changes to `buildNativeToolsArray` or tool metadata are needed for this temporary feature.

The **only** functional effect of this patch should be:

- The API request for native tools now includes `parallel_tool_calls = true`, and
- The model is allowed to emit multiple tool calls per turn, which are then executed sequentially by the existing executor.

---

## 6. How to revert this change later

Because we tagged both modifications with `kilocode_temp_parallel_tool_calls`, reverting is straightforward:

1. Search the repo for `kilocode_temp_parallel_tool_calls`.
2. In [`Task.ts`](src/core/task/Task.ts:3883):
    - Change `const parallelToolCallsEnabled = true` back to `false`, or
    - Remove the constant entirely if a future official implementation computes it differently.
3. In [`nativeToolCallHelpers.ts`](src/api/providers/kilocode/nativeToolCallHelpers.ts:23):
    - Change `params.parallel_tool_calls = true` back to `false`, or
    - Replace it with whatever the official implementation requires (e.g., derived from `metadata.parallelToolCalls`).
4. In [`openrouter.ts`](src/api/providers/openrouter.ts:174):
    - Change `parallel_tool_calls: true` back to `false`, or
    - Replace it with a proper dynamic configuration (e.g., `metadata?.parallelToolCalls ?? false`) when the official implementation is ready.

After reverting or replacing these two lines, **no other files need to be touched** to disable the temporary behavior.

---

## 7. Manual testing plan (sequential behavior)

After implementing the changes above, verify behavior manually:

1. **Basic multi-tool-call scenario**

    - Start a new task in KiloCode.
    - Ask the assistant to read multiple files in one step, e.g.:
        - "Read `package.json`, `tsconfig.json`, and `src/index.ts` and summarize the project."
    - Observe that the assistant issues **multiple native tool calls** in a single assistant turn (e.g., several `read_file` calls).

2. **Execution remains sequential**

    - Confirm via logs or UI that tool calls are executed **one by one**, in order.
    - There should be no evidence of concurrent edits or interleaved diff operations.

3. **No system prompt changes**
    - Verify that prompts and behavior are unchanged except for the ability to call more tools in a single turn.

If these tests pass, the temporary parallel tool calling feature is working as intended: **protocol-level parallel tool calls enabled; execution still sequential; minimal, easy-to-revert patch.**
