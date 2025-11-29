import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "codebase_search",
		description: `Run a semantic search across the workspace to find files relevant to a natural-language query. This tool is best for finding *existing* code, concepts, implementations, or definitions. 
**CRITICAL RULES:**
1. **One Concept Per Query:** Do NOT combine unrelated topics. If you need to find "User Login" AND "Database Settings," make TWO separate tool calls. Combined queries result in poor vector matches.
2. **Search for What Exists:** Do not search for features you have been asked to implement but haven't written yet. Instead, search for the code *surrounding* where the new feature belongs (e.g., search for the parent class, the interface, or similar existing patterns).
3. **Keyword Density:** While this is semantic search, using the specific class names, function names, or technical terms mentioned by the user provides the best results.`,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: `A concise, focused search phrase. Avoid full sentences like "Please help me find...". Use technical keywords or descriptive phrases (e.g., "auth middleware logic" or "calculateTotal function")`,
				},
				path: {
					type: ["string", "null"],
					description: "Limit search to specific subdirectory to reduce noise",
				},
			},
			required: ["query", "path"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
