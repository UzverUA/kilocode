import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatTimeAgo } from "@/utils/format"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"
import { DeleteButton } from "./DeleteButton"
import { FavoriteButton } from "../kilocode/history/FavoriteButton" // kilocode_change
import { CompletedButton } from "../kilocode/history/CompletedButton" // kilocode_change
import { KiloShareSessionButton } from "./KiloShareSessionButton" // kilocode_change
import { StandardTooltip } from "../ui/standard-tooltip"
import { formatLargeNumber } from "@src/utils/format"

export interface TaskItemFooterProps {
	item: HistoryItem
	variant: "compact" | "full"
	isSelectionMode?: boolean
	onDelete?: (taskId: string) => void
}

const TaskItemFooter: React.FC<TaskItemFooterProps> = ({ item, variant, isSelectionMode = false, onDelete }) => {
	return (
		<div className="text-xs text-vscode-descriptionForeground flex justify-between items-center">
			<div className="flex gap-1 items-center text-vscode-descriptionForeground/60">
				{/* Datetime with time-ago format */}
				<StandardTooltip content={new Date(item.ts).toLocaleString()}>
					<span className="first-letter:uppercase">{formatTimeAgo(item.ts)}</span>
				</StandardTooltip>
				<span>·</span>
				{/* Cost */}
				{!!item.totalCost && (
					<span className="flex items-center" data-testid="cost-footer-compact">
						{"$" + item.totalCost.toFixed(3)}
						<i className="codicon codicon-arrow-up text-xs pl-3 font-bold" />
						{formatLargeNumber(item.tokensIn)}
						<i className="codicon codicon-arrow-down text-xs pl-1  font-bold" />
						{formatLargeNumber(item.tokensOut)}
					</span>
				)}
			</div>

			{/* Action Buttons for non-compact view */}
			{!isSelectionMode && (
				<div className="flex flex-row gap-0 -mx-2 items-center text-vscode-descriptionForeground/60 hover:text-vscode-descriptionForeground">
					<CompletedButton isCompleted={item.isCompleted ?? false} id={item.id} />
					<FavoriteButton isFavorited={item.isFavorited ?? false} id={item.id} />
					<CopyButton itemTask={item.task} />
					<KiloShareSessionButton id={item.id} />
					{variant === "full" && <ExportButton itemId={item.id} />}
					{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemFooter
