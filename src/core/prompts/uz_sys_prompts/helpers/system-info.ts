import os from "os"
import osName from "os-name"

export function getSystemInfoPrompt(cwd: string): string {
	let details = `Operating System: ${osName()}
Home Directory: ${os.homedir().toPosix()}
Current Workspace Directory: ${cwd.toPosix()}
The Current Workspace Directory is the active VSCode project directory, and is therefore the default directory for all tool operations.`

	return details
}
