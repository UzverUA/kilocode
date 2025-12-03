import type OpenAI from "openai"

const APPLY_DIFF_DESCRIPTION = `
Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter.

CRITICAL PRE-REQUISITES:
1. Exact Match: The content in the \`<<<<<<< SEARCH\` block must physically match the string in the file *character-for-character*. If you miss a single space or indentation level, the patch will fail.
2. Scope: Keep the SEARCH block minimal but unique. Do not include 50 lines of context if 3 lines are enough to uniquely identify the location. However, ensure it is unique enough not to match the wrong place.

FORMATTING RULES:
- Structure: Use the specific delimiters \`<<<<<<< SEARCH\`, \`-------\`, \`=======\`, and \`>>>>>>> REPLACE\`.
- Delimiter Placement: Each delimiter must be on its own line with no extra spaces or characters!
- Ensure every delimiter line is constructed using a precise sequence of exactly *7*  repeating symbols. You must strictly adhere to this fixed length, as the parser rigidly enforces the seven-character requirement for all boundary markers.
- Line Numbers: The \`:start_line:[number]\` is mandatory in the SEARCH block. This line is used to locate the text and validates uniqueness.
- No Lazy Matching: Never use \`...\`, \`// rest of code\`, or placeholders in the SEARCH block. You must provide the literal code.
- Multiple Edits: You can (and should) include multiple SEARCH/REPLACE blocks in a single \`diff\` string to make multiple changes to one file in one go.
`

const DIFF_PARAMETER_DESCRIPTION = `A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content. Each block must follow this format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE`

export const apply_diff_single_file = {
	type: "function",
	function: {
		name: "apply_diff",
		description: `
Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter.

CRITICAL PRE-REQUISITES:
1. Exact Match: The content in the \`<<<<<<< SEARCH\` block must physically match the string in the file *character-for-character*. If you miss a single space or indentation level, the patch will fail.
2. Scope: Keep the SEARCH block minimal but unique. Do not include 50 lines of context if 3 lines are enough to uniquely identify the location. However, ensure it is unique enough not to match the wrong place.

FORMATTING RULES:
- Structure: Use the specific delimiters \`<<<<<<< SEARCH\`, \`-------\`, \`=======\`, and \`>>>>>>> REPLACE\`.
- Delimiter Placement: Each delimiter must be on its own line with no extra spaces or characters!
- Ensure every delimiter line is constructed using a precise sequence of exactly *7*  repeating symbols. You must strictly adhere to this fixed length, as the parser rigidly enforces the seven-character requirement for all boundary markers.
- Line Numbers: The \`:start_line:[number]\` is mandatory in the SEARCH block. This line is used to locate the text and validates uniqueness.
- No Lazy Matching: Never use \`...\`, \`// rest of code\`, or placeholders in the SEARCH block. You must provide the literal code.
- Multiple Edits: You can (and should) include multiple SEARCH/REPLACE blocks in a single \`diff\` string to make multiple changes to one file in one go.
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
A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content.  You must not add a start line for the replacement content. Each block must follow this format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE
`,
				},
			},
			required: ["path", "diff"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
