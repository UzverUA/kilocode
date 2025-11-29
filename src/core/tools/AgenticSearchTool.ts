import * as vscode from "vscode"

import { TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { parseMarkdownChecklist } from "./UpdateTodoListTool"
import { Package } from "../../shared/package"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

interface AgenticSearchParams {
	message: string
}

export class AgenticSearchTool extends BaseTool<"agentic_search"> {
	readonly name = "agentic_search" as const

	parseLegacy(params: Partial<Record<string, string>>): AgenticSearchParams {
		return {
			message: params.message || "",
		}
	}

	async execute(params: AgenticSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { message } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!message) {
				task.consecutiveMistakeCount++
				task.recordToolError("agentic_search")
				pushToolResult(await task.sayAndCreateMissingParamError("agentic_search", "message"))
				return
			}

			// Get the VSCode setting for requiring todos.
			const provider = task.providerRef.deref()

			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			const state = await provider.getState()

			task.consecutiveMistakeCount = 0

			// Un-escape one level of backslashes before '@' for hierarchical subtasks
			const unescapedMessage = message.replace(/\\\\@/g, "\\@")

			// Verify the mode exists
			const targetMode = getModeBySlug("researcher", state?.customModes)

			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: researcher`))
				return
			}

			const toolMessage = JSON.stringify({
				tool: "agenticSearch",
				mode: "researcher",
				content: message,
			})

			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			if (task.enableCheckpoints) {
				task.checkpointSave(true)
			}

			// Preserve the current mode so we can resume with it later.
			task.pausedModeSlug = (await provider.getState()).mode ?? defaultModeSlug
			const emptyTodoItems: TodoItem[] = []
			const newTask = await task.startSubtask(unescapedMessage, emptyTodoItems, "researcher")

			if (!newTask) {
				pushToolResult(t("tools:newTask.errors.policy_restriction"))
				return
			}

			pushToolResult(`Successfully created new task in researcher mode with message: ${unescapedMessage}`)

			return
		} catch (error) {
			await handleError("creating new task", error)
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"agentic_search">): Promise<void> {
		const mode: string | undefined = block.params.mode
		const message: string | undefined = block.params.message

		const partialMessage = JSON.stringify({
			tool: "agenticSearch",
			mode: this.removeClosingTag("mode", mode, block.partial),
			content: this.removeClosingTag("message", message, block.partial),
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const agenticSearchTool = new AgenticSearchTool()
