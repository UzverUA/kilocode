import * as vscode from "vscode"

import type { ModeConfig, PromptComponent, CustomModePrompts, TodoItem, Experiments } from "@roo-code/types"

import type { SystemPromptSettings } from "../types"

import { Mode, modes, getModeBySlug, getGroupName, getModeSelection } from "../../../shared/modes"
import { DiffStrategy } from "../../../shared/tools"
import { formatLanguage } from "../../../shared/language"
import { McpHub } from "../../../services/mcp/McpHub"
import { CodeIndexManager } from "../../../services/code-index/manager"

import { getToolDescriptionsForMode } from "../tools"
import { getEffectiveProtocol, isNativeProtocol } from "@roo-code/types"
import {
	getRulesSection,
	getSystemInfoSection,
	getObjectiveSection,
	getSharedToolUseSection,
	getMcpServersSection,
	getToolUseGuidelinesSection,
	getCapabilitiesSection,
	getModesSection,
	addCustomInstructions,
	markdownFormattingSection,
} from "../sections"
import { type ClineProviderState } from "../../webview/ClineProvider"

export async function generateDefaultPrompt(
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

	// Get the full mode config to ensure we have the role definition (used for groups, etc.)
	const modeConfig = getModeBySlug(mode, customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0]
	const { roleDefinition, baseInstructions } = getModeSelection(mode, promptComponent, customModeConfigs)

	// Check if MCP functionality should be included
	const hasMcpGroup = modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp")
	const hasMcpServers = mcpHub && mcpHub.getServers().length > 0
	const shouldIncludeMcp = hasMcpGroup && hasMcpServers

	const codeIndexManager = CodeIndexManager.getInstance(context, cwd)

	// Determine the effective protocol (defaults to 'xml')
	const effectiveProtocol = getEffectiveProtocol(settings?.toolProtocol)

	const [modesSection, mcpServersSection] = await Promise.all([
		getModesSection(context),
		shouldIncludeMcp
			? getMcpServersSection(
					mcpHub,
					effectiveDiffStrategy,
					enableMcpServerCreation,
					!isNativeProtocol(effectiveProtocol),
				)
			: Promise.resolve(""),
	])

	// Build tools catalog section only for XML protocol
	const toolsCatalog = isNativeProtocol(effectiveProtocol)
		? ""
		: `\n\n${getToolDescriptionsForMode(
				mode,
				cwd,
				supportsComputerUse,
				codeIndexManager,
				effectiveDiffStrategy,
				browserViewportSize,
				shouldIncludeMcp ? mcpHub : undefined,
				customModeConfigs,
				experiments,
				partialReadsEnabled,
				settings,
				enableMcpServerCreation,
				modelId,
				clineProviderState, // kilocode_change
			)}`

	const basePrompt = `${roleDefinition}

${markdownFormattingSection()}

${getSharedToolUseSection(effectiveProtocol)}${toolsCatalog}

${getToolUseGuidelinesSection(codeIndexManager, effectiveProtocol)}

${mcpServersSection}${/*getCapabilitiesSection(cwd, supportsComputerUse, mode, customModeConfigs, experiments, shouldIncludeMcp ? mcpHub : undefined, effectiveDiffStrategy, codeIndexManager, settings, clineProviderState)*/ ""}

${getRulesSection(cwd, supportsComputerUse, mode, customModeConfigs, experiments, effectiveDiffStrategy, codeIndexManager, settings, clineProviderState /* kilocode_change */)}

${getSystemInfoSection(cwd)}

${getObjectiveSection(codeIndexManager, experiments)}

${await addCustomInstructions(baseInstructions, globalCustomInstructions || "", cwd, mode, {
	language: language ?? formatLanguage(vscode.env.language),
	rooIgnoreInstructions,
	localRulesToggleState: context.workspaceState.get("localRulesToggles"), // kilocode_change
	globalRulesToggleState: context.globalState.get("globalRulesToggles"), // kilocode_change
	settings,
})}`

	return basePrompt
}
