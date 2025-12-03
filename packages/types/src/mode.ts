import { z } from "zod"

import { toolGroupsSchema } from "./tool.js"

/**
 * GroupOptions
 */

export const groupOptionsSchema = z.object({
	fileRegex: z
		.string()
		.optional()
		.refine(
			(pattern) => {
				if (!pattern) {
					return true // Optional, so empty is valid.
				}

				try {
					new RegExp(pattern)
					return true
				} catch {
					return false
				}
			},
			{ message: "Invalid regular expression pattern" },
		),
	description: z.string().optional(),
})

export type GroupOptions = z.infer<typeof groupOptionsSchema>

/**
 * GroupEntry
 */

export const groupEntrySchema = z.union([toolGroupsSchema, z.tuple([toolGroupsSchema, groupOptionsSchema])])

export type GroupEntry = z.infer<typeof groupEntrySchema>

/**
 * ModeConfig
 */

const groupEntryArraySchema = z.array(groupEntrySchema).refine(
	(groups) => {
		const seen = new Set()

		return groups.every((group) => {
			// For tuples, check the group name (first element).
			const groupName = Array.isArray(group) ? group[0] : group

			if (seen.has(groupName)) {
				return false
			}

			seen.add(groupName)
			return true
		})
	},
	{ message: "Duplicate groups are not allowed" },
)

export const modeConfigSchema = z.object({
	slug: z.string().regex(/^[a-zA-Z0-9-]+$/, "Slug must contain only letters numbers and dashes"),
	name: z.string().min(1, "Name is required"),
	roleDefinition: z.string().min(1, "Role definition is required"),
	whenToUse: z.string().optional(),
	description: z.string().optional(),
	customInstructions: z.string().optional(),
	groups: groupEntryArraySchema,
	source: z.enum(["global", "project", "organization"]).optional(), // kilocode_change: Added "organization" source
	iconName: z.string().optional(), // kilocode_change
})

export type ModeConfig = z.infer<typeof modeConfigSchema>

/**
 * CustomModesSettings
 */

export const customModesSettingsSchema = z.object({
	customModes: z.array(modeConfigSchema).refine(
		(modes) => {
			const slugs = new Set()

			return modes.every((mode) => {
				if (slugs.has(mode.slug)) {
					return false
				}

				slugs.add(mode.slug)
				return true
			})
		},
		{
			message: "Duplicate mode slugs are not allowed",
		},
	),
})

export type CustomModesSettings = z.infer<typeof customModesSettingsSchema>

/**
 * PromptComponent
 */

export const promptComponentSchema = z.object({
	roleDefinition: z.string().optional(),
	whenToUse: z.string().optional(),
	description: z.string().optional(),
	customInstructions: z.string().optional(),
})

export type PromptComponent = z.infer<typeof promptComponentSchema>

/**
 * CustomModePrompts
 */

export const customModePromptsSchema = z.record(z.string(), promptComponentSchema.optional())

export type CustomModePrompts = z.infer<typeof customModePromptsSchema>

/**
 * CustomSupportPrompts
 */

export const customSupportPromptsSchema = z.record(z.string(), z.string().optional())

export type CustomSupportPrompts = z.infer<typeof customSupportPromptsSchema>

/**
 * DEFAULT_MODES
 */

export const DEFAULT_MODES: readonly ModeConfig[] = [
	{
		slug: "architect",
		// kilocode_change start
		name: "Architect",
		iconName: "codicon-type-hierarchy-sub",
		// kilocode_change end
		roleDefinition:
			"You are Kilo Code, an experienced technical leader who is inquisitive and an excellent planner. Your goal is to gather information and get context to create a detailed plan for accomplishing the user's task, which the user will review and approve before they switch into another mode to implement the solution.",
		whenToUse:
			"Use this mode when you need to plan, design, or strategize before implementation. Perfect for breaking down complex problems, creating technical specifications, designing system architecture, or brainstorming solutions before coding.",
		description: "Plan and design before implementation",
		groups: ["read", ["edit", { fileRegex: "\\.md$", description: "Markdown files only" }], "browser", "mcp"],
		customInstructions:
			"1. Do some information gathering (using provided tools) to get more context about the task.\n\n2. You should also ask the user clarifying questions to get a better understanding of the task.\n\n3. Once you've gained more context about the user's request, break down the task into clear, actionable steps and create a todo list using the `update_todo_list` tool. Each todo item should be:\n   - Specific and actionable\n   - Listed in logical execution order\n   - Focused on a single, well-defined outcome\n   - Clear enough that another mode could execute it independently\n\n   **Note:** If the `update_todo_list` tool is not available, write the plan to a markdown file (e.g., `plan.md` or `todo.md`) instead.\n\n4. As you gather more information or discover new requirements, update the todo list to reflect the current understanding of what needs to be accomplished.\n\n5. Ask the user if they are pleased with this plan, or if they would like to make any changes. Think of this as a brainstorming session where you can discuss the task and refine the todo list.\n\n6. Include Mermaid diagrams if they help clarify complex workflows or system architecture. Please avoid using double quotes (\"\") and parentheses () inside square brackets ([]) in Mermaid diagrams, as this can cause parsing errors.\n\n7. Use the switch_mode tool to request that the user switch to another mode to implement the solution.\n\n**IMPORTANT: Focus on creating clear, actionable todo lists rather than lengthy markdown documents. Use the todo list as your primary planning tool to track and organize the work that needs to be done.**",
	},
	{
		slug: "code",
		// kilocode_change start
		name: "Code",
		iconName: "codicon-code",
		// kilocode_change end
		roleDefinition:
			"You are Kilo Code, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.",
		whenToUse:
			"Use this mode when you need to write, modify, or refactor code. Ideal for implementing features, fixing bugs, creating new files, or making code improvements across any programming language or framework.",
		description: "Write, modify, and refactor code",
		groups: ["read", "edit", "browser", "command", "mcp"],
	},
	{
		slug: "ask",
		// kilocode_change start
		name: "Ask",
		iconName: "codicon-question",
		// kilocode_change end
		roleDefinition:
			"You are Kilo Code, a knowledgeable technical assistant focused on answering questions and providing information about software development, technology, and related topics.",
		whenToUse:
			"Use this mode when you need explanations, documentation, or answers to technical questions. Best for understanding concepts, analyzing existing code, getting recommendations, or learning about technologies without making changes.",
		description: "Get answers and explanations",
		groups: ["read", "browser", "mcp"],
		customInstructions:
			"You can analyze code, explain concepts, and access external resources. Always answer the user's questions thoroughly, and do not switch to implementing code unless explicitly requested by the user. Include Mermaid diagrams when they clarify your response.",
	},
	{
		slug: "debug",
		// kilocode_change start
		name: "Debug",
		iconName: "codicon-bug",
		// kilocode_change end
		roleDefinition:
			"You are an expert software debugger specializing in systematic problem diagnosis and resolution.",
		whenToUse:
			"Use this mode when you're troubleshooting issues, investigating errors, or diagnosing problems. Specialized in systematic debugging, adding logging, analyzing stack traces, and identifying root causes before applying fixes.",
		description: "Diagnose and fix software issues",
		groups: ["read", "edit", "browser", "command", "mcp"],
		customInstructions:
			"Reflect on 5-7 different possible sources of the problem, distill those down to 1-2 most likely sources, and then add logs to validate your assumptions. Explicitly ask the user to confirm the diagnosis before fixing the problem.",
	},
	{
		slug: "researcher",
		name: "Researcher",
		iconName: "codicon-telescope",
		roleDefinition:
			"You are Kilo Code Researcher, an expert in deep, exhaustive investigation of the project's codebase. Your sole purpose is to answer queries about the code by performing thorough, multi-step searches using available internal search tools. You never ask questions, never speculate, and never fabricate information.",
		whenToUse:
			"Use this mode whenever a task requires detailed knowledge of what exists in the current codebase, how something is implemented, where specific logic lives, what files or components are relevant, or any other question that can only be answered by inspecting the actual code.",
		description: "Agentic codebase search",
		groups: ["read"],
	},
] as const
