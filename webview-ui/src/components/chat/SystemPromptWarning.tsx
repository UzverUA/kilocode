import React, { useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"

export const SystemPromptWarning: React.FC = () => {
	const { t } = useAppTranslation()
	const [isVisible, setIsVisible] = useState(true)

	if (!isVisible) {
		return null
	}

	return (
		<div className="relative flex items-center px-4 py-2 mb-2 pr-7 text-sm rounded bg-vscode-editorWarning-foreground text-vscode-editor-background">
			<div className="flex items-center justify-center w-5 h-5 mr-2">
				<span className="codicon codicon-warning" />
			</div>
			<span>{t("chat:systemPromptWarning")}</span>
			<button
				type="button"
				className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded codicon codicon-close cursor-pointer hover:bg-black/10 focus:outline-none focus:ring-1 focus:ring-[var(--vscode-focusBorder)]"
				aria-label="Dismiss warning"
				onClick={() => setIsVisible(false)}
			/>
		</div>
	)
}

export default SystemPromptWarning
