import React, { memo, useState } from "react"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import TaskItem from "./TaskItem"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { useTaskHistory } from "@/kilocode/hooks/useTaskHistory"

const HistoryPreview = ({ taskHistoryVersion }: { taskHistoryVersion: number } /*kilocode_change*/) => {
	// kilocode_change start
	const { data } = useTaskHistory(
		{
			workspace: "current",
			sort: "newest",
			favoritesOnly: false,
			pageIndex: 0,
		},
		taskHistoryVersion,
	)
	const tasks = data?.historyItems ?? []
	// filter out subtasks from recent view
	const rootTasks = tasks.filter((item) => item.parentTaskId === undefined)
	// kilocode_change end
	const { t } = useAppTranslation()
	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)

	const handleViewAllHistory = () => {
		vscode.postMessage({ type: "switchTab", tab: "history" })
	}

	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center justify-between mt-4 mb-2">
				<h2 className="font-semibold text-lg grow m-0">{t("history:recentTasks")}</h2>
				<button
					onClick={handleViewAllHistory}
					className="text-base text-vscode-descriptionForeground hover:text-vscode-textLink-foreground transition-colors cursor-pointer"
					aria-label={t("history:viewAllHistory")}>
					{t("history:viewAllHistory")}
				</button>
			</div>
			{rootTasks.length !== 0 && (
				<div className="overflow-y-auto space-y-2">
					{rootTasks.slice(0, 10).map((item) => (
						<TaskItem key={item.id} item={item} variant="compact" onDelete={(id) => setDeleteTaskId(id)} />
					))}
				</div>
			)}
			{deleteTaskId && (
				<DeleteTaskDialog taskId={deleteTaskId} open onOpenChange={(open) => !open && setDeleteTaskId(null)} />
			)}
		</div>
	)
}

export default memo(HistoryPreview)
