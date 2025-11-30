import type OpenAI from "openai"

export const apply_diff_single_file = {
	type: "function",
	function: {
		name: "apply_diff",
		description: `
Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter. Use the 'read_file' tool first if you are not confident in the exact content to search for.
**CRITICAL PRE-REQUISITES:**
1.  **Read First:** You MUST have successfully run \`read_file\` on the target file recently. Do not rely on memory or previous turns. You need the *exact* current content (including invisible newline characters and indentation) to create a match.
2.  **Exact Match:** The content in the \`<<<<<<< SEARCH\` block must physically match the string in the file *character-for-character*. If you miss a single space or indentation level, the patch will fail.
3.  **Scope:** Keep the SEARCH block minimal but unique. Do not include 50 lines of context if 3 lines are enough to uniquely identify the location. However, ensure it is unique enough not to match the wrong place.

**FORMATTING RULES:**
- **Structure:** Use the specific delimiters \`<<<<<<< SEARCH\`, \`-------\`, \`=======\`, and \`>>>>>>> REPLACE\`.
- **Delimiter Placement:** Each delimiter must be on its own line with no extra spaces or characters!
- **Line Numbers:** The \`:start_line:[number]\` is mandatory in the SEARCH block. This helps the tool locate the text faster and validates uniqueness.
- **No Lazy Matching:** Never use \`...\`, \`// rest of code\`, or placeholders in the SEARCH block. You must provide the literal code.
- **Multiple Edits:** You can (and should) include multiple SEARCH/REPLACE blocks in a single \`diff\` string to make multiple changes to one file in one go.
`,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The path of the file to modify, relative to the current workspace directory.",
				},
				diff: {
					type: "string",
					description: `
- A string containing one or more search/replace blocks defining the changes. 
- The ':start_line:' is required and indicates the starting line number of the original content. 
- You must NOT add :start_line: in REPLACE block, it is only for SEARCH block.
Each block must follow this format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE

Example:
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
			required: ["path", "diff"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
