import * as vscode from "vscode"
import { ICodeIndexReranker, RerankerDocument, RerankerResult } from "../interfaces/reranker"

const DEEPINFRA_RERANK_ENDPOINT = "https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-8B"
const DEEPINFRA_API_KEY_ENV_VAR = "KILO_DEEPINFRA_API_KEY"

export class DeepinfraReranker implements ICodeIndexReranker {
	constructor(
		private readonly batchSize: number = 500,
		private readonly timeoutMs: number = 20000,
		private readonly _minScore: number = 0.5,
	) {}

	public get minScore(): number {
		return this._minScore
	}

	public async rerank(query: string, documents: RerankerDocument[]): Promise<RerankerResult[]> {
		if (!documents || documents.length === 0) {
			return []
		}

		try {
			const allResults: RerankerResult[] = []

			for (let i = 0; i < documents.length; i += this.batchSize) {
				const batchDocs = documents.slice(i, i + this.batchSize)

				const documentsPayload = batchDocs.map((doc) => {
					const relativePath = vscode.workspace.asRelativePath(doc.filePath, false)
					return `${relativePath}\n\n${doc.codeChunk}`
				})

				const queriesPayload = batchDocs.map(() => query)

				const controller = new AbortController()
				const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

				const apiKey = this.getApiKey()
				if (!apiKey) {
					throw new Error(
						"[DeepinfraReranker] Missing API key. Set KILO_DEEPINFRA_API_KEY or DEEPINFRA_API_KEY in your environment.",
					)
				}

				let response: any
				try {
					response = await fetch(DEEPINFRA_RERANK_ENDPOINT, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							queries: queriesPayload,
							documents: documentsPayload,
							// Optional: you can tweak the instruction if needed
							instruction:
								"Given a web search query, retrieve relevant code snippets that answer the query",
						}),
						signal: controller.signal,
					} as any)
				} finally {
					clearTimeout(timeout)
				}

				if (!response.ok) {
					const text = await this.safeReadResponseText(response)
					const snippet = this.truncate(text)
					throw new Error(`[DeepinfraReranker] HTTP ${response.status} ${response.statusText}: ${snippet}`)
				}

				let json: any
				try {
					json = await response.json()
				} catch (err) {
					throw new Error(`[DeepinfraReranker] Failed to parse JSON response: ${(err as Error).message}`)
				}

				if (!json || !Array.isArray(json.scores)) {
					const snippet = this.truncate(JSON.stringify(json))
					throw new Error(
						"[DeepinfraReranker] Invalid response shape, expected { scores: [...] } got: " + snippet,
					)
				}

				if (json.scores.length !== batchDocs.length) {
					const snippet = this.truncate(JSON.stringify(json))
					throw new Error(
						`[DeepinfraReranker] Mismatch between scores length (${json.scores.length}) and documents length (${batchDocs.length}): ${snippet}`,
					)
				}

				const batchResults: RerankerResult[] = batchDocs.map((doc, index) => {
					const score = json.scores[index]
					if (typeof score !== "number") {
						throw new Error(`[DeepinfraReranker] Missing or invalid score for result at index ${index}`)
					}

					return {
						id: doc.id,
						score,
					}
				})

				allResults.push(...batchResults)
			}

			allResults.sort((a, b) => b.score - a.score)
			return allResults
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(error.message)
			}
			throw new Error(String(error))
		}
	}

	private getApiKey(): string | undefined {
		const value = process.env[DEEPINFRA_API_KEY_ENV_VAR]
		if (value && value.trim().length > 0) {
			return value.trim()
		}
		return undefined
	}

	private truncate(value: string | undefined, maxLen: number = 200): string {
		if (!value) {
			return ""
		}
		if (value.length <= maxLen) {
			return value
		}
		return value.slice(0, maxLen) + "..."
	}

	private async safeReadResponseText(response: any): Promise<string> {
		try {
			return await response.text()
		} catch {
			return ""
		}
	}
}
