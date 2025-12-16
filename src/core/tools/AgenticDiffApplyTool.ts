import * as vscode from "vscode"

import { TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

interface AgenticDiffApplyParams {
	message: string
}

export class AgenticDiffApplyTool extends BaseTool<"agentic_apply_diff"> {
	readonly name = "agentic_apply_diff" as const

	parseLegacy(params: Partial<Record<string, string>>): AgenticDiffApplyParams {
		return {
			message: params.message || params.diff || params.args || "",
		}
	}

	async execute(params: AgenticDiffApplyParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { message } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!message) {
				task.consecutiveMistakeCount++
				task.recordToolError("agentic_apply_diff")
				pushToolResult(await task.sayAndCreateMissingParamError("agentic_apply_diff", "message"))
				return
			}

			const provider = task.providerRef.deref()

			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			const state = await provider.getState()

			task.consecutiveMistakeCount = 0

			// Un-escape one level of backslashes before '@' for hierarchical subtasks
			const unescapedDiffblocks = message.replace(/\\\\@/g, "\\@")

			// Verify the mode exists
			const targetMode = getModeBySlug("diff_apply", state?.customModes)

			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: diff_apply`))
				return
			}

			const toolMessage = JSON.stringify({
				tool: "agenticDiffApply",
				mode: "diff_apply",
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
				message: unescapedDiffblocks,
				initialTodos: emptyTodoItems,
				mode: "diff_apply",
			})

			// Reflect delegation in tool result (no pause/unpause, no wait)
			pushToolResult(`Delegated to child task ${child.taskId}`)

			return
		} catch (error) {
			await handleError("creating new task", error)
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"agentic_apply_diff">): Promise<void> {
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

export const agenticDiffApplyTool = new AgenticDiffApplyTool()
