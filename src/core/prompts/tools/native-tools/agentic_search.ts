import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "agentic_search",
		description:
			"Use a LLM-driven agentic search to gather information about current project and its codebase on a specific query or set of queries of any complexity. The agent will perform deep, multi-step investigations using internal search tools to find and provide relevant code references, explanations, and context.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description: "Query with instuctions and context for the LLM-driven agentic search task",
				},
			},
			required: ["message"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
