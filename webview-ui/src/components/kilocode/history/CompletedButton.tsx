import { vscode } from "@/utils/vscode"
import { Button } from "@src/components/ui"

export const CompletedButton = ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
	return (
		<Button
			variant="ghost"
			size="icon"
			title={isCompleted ? "Mark as incomplete" : "Mark as completed"}
			data-testid="completed-task-button"
			onClick={(e: React.MouseEvent) => {
				e.stopPropagation()
				vscode.postMessage({ type: "toggleTaskCompleted", text: id })
			}}
			className={`group-hover:opacity-100 transition-opacity ${isCompleted ? "opacity-70" : "opacity-50"}`}>
			<span
				className={`codicon codicon-check-all`}
				style={{ color: isCompleted ? "var(--vscode-charts-green)" : undefined }}
			/>
		</Button>
	)
}
