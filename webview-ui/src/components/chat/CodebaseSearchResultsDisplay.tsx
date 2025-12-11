import React, { useState } from "react"
import CodebaseSearchResult from "./CodebaseSearchResult"
import { Trans } from "react-i18next"

interface CodebaseSearchResultsDisplayProps {
	results: Array<{
		filePath: string
		score: number
		startLine: number
		endLine: number
		codeChunk: string
		rerankFiltered?: boolean
	}>
	totalResults?: number
	visibleResults?: number
}

const CodebaseSearchResultsDisplay: React.FC<CodebaseSearchResultsDisplayProps> = ({
	results,
	totalResults,
	visibleResults,
}) => {
	const [codebaseSearchResultsExpanded, setCodebaseSearchResultsExpanded] = useState(false)

	const effectiveVisible = typeof visibleResults === "number" ? visibleResults : results.length
	const effectiveTotal = typeof totalResults === "number" ? totalResults : results.length

	return (
		<div className="flex flex-col -mt-4 gap-1">
			<div
				onClick={() => setCodebaseSearchResultsExpanded(!codebaseSearchResultsExpanded)}
				className="cursor-pointer flex items-center justify-between px-2 py-2 border bg-[var(--vscode-editor-background)] border-[var(--vscode-editorGroup-border)]">
				<span className="flex items-center gap-1 text-xs">
					<Trans
						i18nKey="chat:codebaseSearch.didSearch"
						count={effectiveVisible}
						values={{ count: effectiveVisible }}
					/>
					{effectiveTotal > effectiveVisible && (
						<span className="text-vscode-descriptionForeground">(out of {effectiveTotal})</span>
					)}
				</span>
				<span className={`codicon codicon-chevron-${codebaseSearchResultsExpanded ? "up" : "down"}`}></span>
			</div>

			{codebaseSearchResultsExpanded && (
				<div className="flex flex-col gap-1">
					{results.map((result, idx) => (
						<CodebaseSearchResult
							key={idx}
							filePath={result.filePath}
							score={result.score}
							startLine={result.startLine}
							endLine={result.endLine}
							language="plaintext"
							snippet={result.codeChunk}
							rerankFiltered={result.rerankFiltered}
						/>
					))}
				</div>
			)}
		</div>
	)
}

export default CodebaseSearchResultsDisplay
