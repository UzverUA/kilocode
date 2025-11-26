import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "attempt_completion",
		description:
			"If you think that task is completed and no further actions are needed - use MUST always use this tool to mark task as completed. It's IMPORTANT to mark completed tasks.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description: "Concise, brief and to the point summary of completion.",
				},
			},
			required: ["result"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
