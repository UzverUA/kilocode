import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "agentic_apply_diff",
		description: `
Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter.

CRITICAL PRE-REQUISITES:
1. Exact Match: The content in the \`<<<<<<< SEARCH\` block must physically match the string in the file *character-for-character*. If you miss a single space or indentation level, the patch will fail.
2. Scope: Keep the SEARCH block minimal but unique. Do not include 50 lines of context if 3 lines are enough to uniquely identify the location. However, ensure it is unique enough not to match the wrong place.

FORMATTING RULES:
- Structure: Use the specific delimiters \`<<<<<<< SEARCH\`, \`-------\`, \`=======\`, and \`>>>>>>> REPLACE\`.
- Path to file: Must be a relative path to the file from the project root. Placed above diff block to tell which file to apply diff block to.
- Delimiter Placement: Each delimiter must be on its own line with no extra spaces or characters!
- Ensure every delimiter line is constructed using a precise sequence of exactly seven repeating symbols. You must strictly adhere to this fixed length, as the parser rigidly enforces the seven-character requirement for all boundary markers.
- Line Numbers: The \`:start_line:[number]\` is mandatory in the SEARCH block. This line is used to locate the text and validates uniqueness.
- No Lazy Matching: Never use \`...\`, \`// rest of code\`, or placeholders in the SEARCH block. You must provide the literal code.
- Multiple Edits: You can (and should) include multiple SEARCH/REPLACE blocks in a single \`diff\` string to make multiple changes to one file in one go.
`,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description: `
- A string containing one or more search/replace blocks defining the changes. 
- The ':start_line:' is required and indicates the starting line number of the original content. 
- You must NOT add :start_line: in REPLACE block, it is only for SEARCH block.
Each block must follow this format:

path/to/file.ts
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE

Example:

src/core/task.ts
<<<<<<< SEARCH
:start_line:10
-------
export function add(a: number, b: number) {
    return a + b;
}
=======
export function add(a: number, b: number): number {
    // Added explicit return type
    return a + b;
}
>>>>>>> REPLACE

app/run.py
<<<<<<< SEARCH
:start_line:45
-------
    console.log("Debug info");
=======
    // console.log("Debug info");
>>>>>>> REPLACE
`,
				},
			},
			required: ["message"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
