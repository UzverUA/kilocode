import * as vscode from "vscode"

import type { ModeConfig, PromptComponent, CustomModePrompts, TodoItem, Experiments } from "@roo-code/types"

import type { SystemPromptSettings } from "../types"

import { Mode, modes, getModeBySlug, getGroupName, getModeSelection } from "../../../shared/modes"
import { DiffStrategy } from "../../../shared/tools"
import { McpHub } from "../../../services/mcp/McpHub"
import { type ClineProviderState } from "../../webview/ClineProvider"

import { generateResearcherPrompt } from "./system-researcher"
import { generateApplyDiffPrompt } from "./system-apply-diff"
import { generateDefaultPrompt } from "./system-default"
import { generateCodePrompt } from "./system-code"
import { generateAskPrompt } from "./system-ask"
import { generateArchitectPrompt } from "./system-architect"

export async function generatePrompt(
	context: vscode.ExtensionContext,
	cwd: string,
	supportsComputerUse: boolean,
	mode: Mode,
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
	browserViewportSize?: string,
	promptComponent?: PromptComponent,
	customModeConfigs?: ModeConfig[],
	globalCustomInstructions?: string,
	diffEnabled?: boolean,
	experiments?: Record<string, boolean>,
	enableMcpServerCreation?: boolean,
	language?: string,
	rooIgnoreInstructions?: string,
	partialReadsEnabled?: boolean,
	settings?: SystemPromptSettings,
	todoList?: TodoItem[],
	modelId?: string,
	clineProviderState?: ClineProviderState, // kilocode_change
): Promise<string> {
	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}
	// If diff is disabled, don't pass the diffStrategy
	const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined

	if (mode === "researcher") {
		return generateResearcherPrompt(cwd)
	} else if (mode === "diff_apply") {
		return generateApplyDiffPrompt(cwd)
	} else if (mode === "code") {
		return generateCodePrompt(cwd)
	} else if (mode === "ask") {
		return generateAskPrompt(cwd)
	} else if (mode === "architect") {
		return generateArchitectPrompt(cwd)
	} else {
		return generateDefaultPrompt(
			context,
			cwd,
			supportsComputerUse,
			mode,
			mcpHub,
			effectiveDiffStrategy,
			browserViewportSize,
			promptComponent,
			customModeConfigs,
			globalCustomInstructions,
			diffEnabled,
			experiments,
			enableMcpServerCreation,
			language,
			rooIgnoreInstructions,
			partialReadsEnabled,
			settings,
			todoList,
			modelId,
			clineProviderState, // kilocode_change
		)
	}
}
