import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "attempt_completion",
		description:
			"If you think that task is completed and no further actions are needed - use this tool to mark task as completed.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description: "Concise, brief and to the point summary of the final result of the task.",
				},
			},
			required: ["result"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
