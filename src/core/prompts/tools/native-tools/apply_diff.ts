import type OpenAI from "openai"

const APPLY_DIFF_DESCRIPTION = `Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter. Use the 'read_file' tool first if you are not confident in the exact content to search for.

Scope: Keep the SEARCH block minimal but unique. Do not include 50 lines of context if 3 lines are enough to uniquely identify the location. However, ensure it is unique enough not to match the wrong place.

Formatting rules:
- Structure: Use the specific delimiters \`<<<<<<< SEARCH\`, \`-------\`, \`=======\`, and \`>>>>>>> REPLACE\`.
- Delimiter Placement: Each delimiter must be on its own line with no extra spaces or characters!
- Repeatable characters in delimiter: Ensure every delimiter line is constructed using a precise sequence of exactly *7*  repeating symbols. You must strictly adhere to this fixed length, as the parser rigidly enforces the seven-character requirement for all boundary markers.
- Line Numbers: The \`:start_line:[number]\` MUST be included ONLY in the SEARCH block.
- No Lazy Matching: Never use \`...\`, \`// rest of code\`, or placeholders in the SEARCH block. You must provide the literal code.
- Multiple Edits: You can include multiple SEARCH/REPLACE blocks in a single \`diff\` string to make multiple changes to one file in one go.`

const DIFF_PARAMETER_DESCRIPTION = `A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content. 
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
>>>>>>> REPLACE`

export const apply_diff = {
	type: "function",
	function: {
		name: "apply_diff",
		description: APPLY_DIFF_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The path of the file to modify, relative to the current workspace directory.",
				},
				diff: {
					type: "string",
					description: DIFF_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "diff"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
