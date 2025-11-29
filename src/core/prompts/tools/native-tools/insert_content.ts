import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "insert_content",
		description: `A pure insertion tool. It adds new text to a file at a specific line number without deleting or modifying any existing code. Use this for adding imports, new methods, or appending data.

**CRITICAL RULES:**
1.  **Verify Line Numbers:** You must have recently read the file to know the correct line numbers. Line numbers change as you edit files; do not guess.
2.  **"Before" Logic:** The insertion happens **BEFORE** the specified \`line\`.
	- If you target Line 1, your content becomes the new Line 1.
	- If you target Line 10, your content appears between the old Line 9 and Line 10.
3.  **Indentation Matters:** The tool does **not** auto-format. If you are inserting code inside a class or function, your \`content\` string must include the correct leading spaces or tabs to match the surrounding code style.
4.  **Pure Addition:** If you need to *change* or *remove* existing lines, do not use this. Use other tools instead.`,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Relative path to the file (relative to the workspace)",
				},
				line: {
					type: "integer",
					description:
						"The line number to insert *before*. Use 0 specifically to append to the very end of the file.",
					minimum: 0,
				},
				content: {
					type: "string",
					description: "Exact text to insert at the chosen location",
				},
			},
			required: ["path", "line", "content"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
