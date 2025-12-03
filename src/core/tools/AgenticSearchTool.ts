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
			const emptyTodoItems: TodoItem[] = []
			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			if (task.enableCheckpoints) {
				task.checkpointSave(true)
			}

			// Delegate parent and open child as sole active task
			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: unescapedMessage,
				initialTodos: emptyTodoItems,
				mode: "researcher",
			})

			// Reflect delegation in tool result (no pause/unpause, no wait)
			pushToolResult(`Delegated to child task ${child.taskId}`)

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
