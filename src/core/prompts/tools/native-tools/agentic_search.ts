import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "agentic_search",
		description: `Use a LLM-driven agentic search to gather information about current project and its codebase on a specific query or set of queries of any complexity. 
*DO NOT USE if you need to ONLY read a single file with known path. Use the 'read_file' tool instead.*
The agent will perform deep, multi-step investigations using internal search tools to find and provide relevant code references, explanations, and context. 
The agent spawned by this tool starts with **ZERO** knowledge of the current conversation history. It does not know what "that function" or "the previous error" refers to. 
You must include all necessary context in the \`message\`.`,
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
