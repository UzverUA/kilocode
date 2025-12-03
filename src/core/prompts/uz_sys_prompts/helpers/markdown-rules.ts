export function getMarkdownRulesPrompt(cwd: string): string {
	let details = `- ALL responses MUST show ANY \`language construct\` OR filename reference as clickable, exactly as [\`filename OR language.declaration()\`](relative/file/path.ext:line); line is required for \`syntax\` and optional for filename links.
- ALL multi-line code, terminal output, or file content MUST be wrapped in triple backticks with the correct language identifier (e.g., \`\`\`typescript, \`\`\`bash). NEVER output raw, unformatted code text.
- Use single backticks (\`variableName\`) for inline variables, methods, or short concepts within sentences.`

	return details
}
