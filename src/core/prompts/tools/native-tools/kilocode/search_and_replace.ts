import type OpenAI from "openai"
import z from "zod/v4"

export const SearchAndReplaceParametersSchema = z.object({
	path: z.string().describe("The path to the file to modify (relative to the current workspace directory)."),
	old_str: z
		.string()
		.describe(
			"The text to replace (must match exactly, including whitespace and indentation). Provide enough context to make a unique match.",
		),
	new_str: z.string().describe("The new text to insert in place of the old text."),
})

export type SearchAndReplaceParameters = z.infer<typeof SearchAndReplaceParametersSchema>

export default {
	type: "function",
	function: {
		name: "apply_diff",
		description: "Replace a specific string in a file with a new string. This is used for making precise edits.",
		strict: true,
		parameters: z.toJSONSchema(SearchAndReplaceParametersSchema),
	},
} satisfies OpenAI.Chat.ChatCompletionTool

// A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content, only for SEARCH.
// Each block must follow this format:
// <<<<<<< SEARCH
// :start_line:[line_number]
// -------
// [exact content to find]
// =======
// [new content to replace with]
// >>>>>>> REPLACE

// Example:
// <<<<<<< SEARCH
// :start_line:10
// -------
// export function add(a: number, b: number) {
//     return a + b;
// }
// =======
// export function add(a: number, b: number): number {
//     // Added explicit return type
//     return a + b;
// }
// >>>>>>> REPLACE
// <<<<<<< SEARCH
// :start_line:45
// -------
//     console.log("Debug info");
// =======
//     // console.log("Debug info");
// >>>>>>> REPLACE
