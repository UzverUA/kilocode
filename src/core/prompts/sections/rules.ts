import { DiffStrategy } from "../../../shared/tools"
import { CodeIndexManager } from "../../../services/code-index/manager"
import type { SystemPromptSettings } from "../types"
import { getEffectiveProtocol, isNativeProtocol } from "@roo-code/types"
import type { ModeConfig, ToolName } from "@roo-code/types"
import { getAvailableToolsInGroup } from "../tools/filter-tools-for-mode"

// kilocode_change start
import { getFastApplyEditingInstructions } from "../tools/edit-file"
import { type ClineProviderState } from "../../webview/ClineProvider"
import { getFastApplyModelType, isFastApplyAvailable } from "../../tools/kilocode/editFileTool"
import { ManagedIndexer } from "../../../services/code-index/managed/ManagedIndexer"
// kilocode_change end

function getEditingInstructions(
	mode: string,
	customModes: ModeConfig[] | undefined,
	experiments: Record<string, boolean> | undefined,
	codeIndexManager: CodeIndexManager | undefined,
	settings: SystemPromptSettings | undefined,
	diffStrategy?: DiffStrategy,
	clineProviderState?: ClineProviderState, // kilocode_change
): string {
	// Get available editing tools from the edit group
	const availableEditTools = getAvailableToolsInGroup(
		"edit",
		mode,
		customModes,
		experiments,
		codeIndexManager,
		settings,
	)

	// Filter for the main editing tools we care about
	const hasApplyDiff = diffStrategy && availableEditTools.includes("apply_diff" as ToolName)
	const hasWriteToFile = availableEditTools.includes("write_to_file" as ToolName)
	const hasInsertContent = availableEditTools.includes("insert_content" as ToolName)

	// If no editing tools are available, return empty string
	if (availableEditTools.length === 0) {
		return ""
	}

	const instructions: string[] = []
	const availableTools: string[] = []

	// Collect available editing tools
	if (hasApplyDiff) {
		availableTools.push("apply_diff (for surgical edits - targeted changes to specific lines or functions)")
	}
	if (hasWriteToFile) {
		availableTools.push("write_to_file (for creating new files or complete file rewrites)")
	}
	if (hasInsertContent) {
		availableTools.push("insert_content (for adding lines to files)")
	}

	// Base editing instruction mentioning all available tools
	if (availableTools.length > 0) {
		instructions.push(`- For editing files, you have access to these tools: ${availableTools.join(", ")}.`)
	}

	// Additional details for insert_content
	if (hasInsertContent) {
		instructions.push(
			"- The insert_content tool adds lines of text to files at a specific line number, such as adding a new function to a JavaScript file or inserting a new route in a Python file. Use line number 0 to append at the end of the file, or any positive number to insert before that line.",
		)
	}

	// Preference instruction if multiple tools are available
	if (availableTools.length > 1 && hasWriteToFile) {
		instructions.push(
			"- You should always prefer using other editing tools over write_to_file when making changes to existing files since write_to_file is much slower and cannot handle large files.",
		)
	}

	// Write to file instructions
	if (hasWriteToFile) {
		instructions.push(
			"- When using the write_to_file tool to modify a file, use the tool directly with the desired content. You do not need to display the content before using the tool. ALWAYS provide the COMPLETE file content in your response. This is NON-NEGOTIABLE. Partial updates or placeholders like '// rest of code unchanged' are STRICTLY FORBIDDEN. You MUST include ALL parts of the file, even if they haven't been modified. Failure to do so will result in incomplete or broken code, severely impacting the user's project.",
		)
	}

	return instructions.join("\n")
}

export function getRulesSection(
	cwd: string,
	supportsComputerUse: boolean,
	mode: string,
	customModes: ModeConfig[] | undefined,
	experiments: Record<string, boolean> | undefined,
	diffStrategy?: DiffStrategy,
	codeIndexManager?: CodeIndexManager,
	settings?: SystemPromptSettings,
	clineProviderState?: ClineProviderState, // kilocode_change
): string {
	const isCodebaseSearchAvailable =
		// kilocode_change start
		ManagedIndexer.getInstance().isEnabled() ||
		(codeIndexManager &&
			codeIndexManager.isFeatureEnabled &&
			codeIndexManager.isFeatureConfigured &&
			codeIndexManager.isInitialized)
	// kilocode_change end

	const codebaseSearchRule = isCodebaseSearchAvailable
		? "- **CRITICAL: For ANY exploration of code you haven't examined yet in this conversation, you MUST use the `codebase_search` tool FIRST before using search_files or other file exploration tools.** This requirement applies throughout the entire conversation, not just when starting a task. The codebase_search tool uses semantic search to find relevant code based on meaning, not just keywords, making it much more effective for understanding how features are implemented. Even if you've already explored some parts of the codebase, any new area or functionality you need to understand requires using codebase_search first.\n"
		: ""

	const agenticSearchRule = isCodebaseSearchAvailable
		? "- **CRITICAL: For ANY exploration of code you haven't examined yet in this conversation, you MUST use the `agentic_search` tool FIRST before using other file exploration tools.** This requirement applies throughout the entire conversation, not just when starting a task. The `agentic_search` tool uses a LLM-powered agent to search relevant code based on meaning, questions, context, not just keywords, making it much more effective for understanding how features are implemented. Even if you've already explored some parts of the codebase, any new area or functionality you need to understand requires using `agentic_search` first.\n"
		: ""
	const searchToolRule = mode === "researcher" ? codebaseSearchRule : agenticSearchRule

	const kiloCodeUseMorph = isFastApplyAvailable(clineProviderState)
	// Get available tools from relevant groups
	const availableEditTools = getAvailableToolsInGroup(
		"edit",
		mode,
		customModes,
		experiments,
		codeIndexManager,
		settings,
	)
	const availableBrowserTools = getAvailableToolsInGroup(
		"browser",
		mode,
		customModes,
		experiments,
		codeIndexManager,
		settings,
	)

	// Check which editing tools are available for the search_files tool description
	const hasApplyDiff = diffStrategy && availableEditTools.includes("apply_diff" as ToolName)
	const hasWriteToFile = availableEditTools.includes("write_to_file" as ToolName)
	const hasBrowserAction = supportsComputerUse && availableBrowserTools.includes("browser_action" as ToolName)

	// Build editing tools reference for search_files description
	let editingToolsRef = ""
	if (hasApplyDiff && hasWriteToFile) {
		editingToolsRef = "apply_diff or write_to_file"
	} else if (hasApplyDiff) {
		editingToolsRef = "apply_diff"
	} else if (hasWriteToFile) {
		editingToolsRef = "write_to_file"
	}

	// Determine whether to use XML tool references based on protocol
	const effectiveProtocol = getEffectiveProtocol(settings?.toolProtocol)

	return `====

RULES

- The project base directory is: ${cwd.toPosix()}
- All file paths must be relative to this directory.
${searchToolRule}- When using the search_files tool, craft your regex patterns carefully to balance specificity and flexibility. Based on the user's task you may use it to find code patterns, TODO comments, function definitions, or any text-based information across the project. The results include context, so analyze the surrounding code to better understand the matches. Leverage the search_files tool in combination with other tools for more comprehensive analysis. For example, use it to find specific code patterns, then use read_file to examine the full context of interesting matches before using ${kiloCodeUseMorph ? "edit_file" : diffStrategy ? "apply_diff or write_to_file" : "write_to_file"} to make informed changes.${getEditingInstructions(mode, customModes, experiments, codeIndexManager, settings, diffStrategy)}
- Be sure to consider the type of project (e.g. Python, JavaScript, web application) when determining the appropriate structure and files to include. Also consider what files may be most relevant to accomplishing the task, for example looking at a project's manifest file would help you understand the project's dependencies, which you could incorporate into any code you write.
  * For example, in architect mode trying to edit app.js would be rejected because architect mode can only edit files matching "\\.md$"
- When making changes to code, always consider the context in which the code is being used. Ensure that your changes are compatible with the existing codebase and that they follow the project's coding standards and best practices.
- Do not ask for more information than necessary. Use the tools provided to accomplish the user's request efficiently and effectively. The user may provide feedback, which you can use to make improvements and try again.
- You are only allowed to ask the user questions using the ask_followup_question tool. Use this tool only when you need additional details to complete a task, and be sure to use a clear and concise question that will help you move forward with the task. When you ask a question, provide the user with 2-4 suggested answers based on your question so they don't need to do so much typing. The suggestions should be specific, actionable, and directly related to the completed task. They should be ordered by priority or logical sequence. However if you can use the available tools to avoid having to ask the user questions, you should do so.
- The user may provide a file's contents directly in their message, in which case you shouldn't use the read_file tool to get the file contents again since you already have it.
- Your goal is to try to accomplish the user's task, NOT engage in a back and forth conversation.
- You are STRICTLY FORBIDDEN from starting your messages with "Great", "Certainly", "Okay", "Sure". You should NOT be conversational in your responses, but rather direct and to the point. For example you should NOT say "Great, I've updated the CSS" but instead something like "I've updated the CSS". It is important you be clear and technical in your messages.
- At the end of each user message, you will automatically receive environment_details. This information is not written by the user themselves, but is auto-generated to provide potentially relevant context about the project structure and environment. While this information can be valuable for understanding the project context, do not treat it as a direct part of the user's request or response. Use it to inform your actions and decisions, but don't assume the user is explicitly asking about or referring to this information unless they clearly do so in their message. When using environment_details, explain your actions clearly to ensure the user understands, as they may not be aware of these details.
- It is critical you wait for the user's response after each tool use, in order to confirm the success of the tool use. For example, if asked to make a todo app, you would create a file, wait for the user's response it was created successfully, then create another file if needed, wait for the user's response it was created successfully, etc.`
}
