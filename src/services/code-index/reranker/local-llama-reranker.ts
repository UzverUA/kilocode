import * as vscode from "vscode"
import { ICodeIndexReranker, RerankerDocument, RerankerResult } from "../interfaces/reranker"

const RERANK_ENDPOINT = "http://localhost:8080/reranking"

export class LocalLlamaReranker implements ICodeIndexReranker {
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

				const controller = new AbortController()
				const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

				let response: any
				try {
					response = await fetch(RERANK_ENDPOINT, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							query,
							documents: documentsPayload,
						}),
						signal: controller.signal,
					} as any)
				} finally {
					clearTimeout(timeout)
				}

				if (!response.ok) {
					const text = await this.safeReadResponseText(response)
					const snippet = this.truncate(text)
					throw new Error(`[LocalLlamaReranker] HTTP ${response.status} ${response.statusText}: ${snippet}`)
				}

				let json: any
				try {
					json = await response.json()
				} catch (err) {
					throw new Error(`[LocalLlamaReranker] Failed to parse JSON response: ${(err as Error).message}`)
				}

				if (!json || !Array.isArray(json.results)) {
					const snippet = this.truncate(JSON.stringify(json))
					throw new Error(
						"[LocalLlamaReranker] Invalid response shape, expected { results: [...] } got: " + snippet,
					)
				}

				const batchResults: RerankerResult[] = json.results.map((item: any, index: number) => {
					const idx = typeof item.index === "number" ? item.index : index
					const score = item.relevance_score
					if (typeof score !== "number") {
						throw new Error(
							`[LocalLlamaReranker] Missing or invalid relevance_score for result at index ${index}`,
						)
					}

					const doc = batchDocs[idx]
					if (!doc) {
						throw new Error(
							`[LocalLlamaReranker] Response index ${idx} out of range for batch size ${batchDocs.length}`,
						)
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
