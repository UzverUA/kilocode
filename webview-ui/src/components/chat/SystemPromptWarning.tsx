import React from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"

export const SystemPromptWarning: React.FC = () => {
	const { t } = useAppTranslation()

	return (
		<div className="flex items-center justify-center gap-1 px-2 py-1 mb-1 text-xs rounded-sm border border-vscode-editorWarning-foreground bg-vscode-editor-background text-vscode-editorWarning-foreground">
			<span className="codicon codicon-warning" />
			<span>{t("chat:systemPromptWarning")}</span>
		</div>
	)
}

export default SystemPromptWarning
