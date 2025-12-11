import * as path from "path"
import { VectorStoreSearchResult } from "./interfaces"
import { IEmbedder } from "./interfaces/embedder"
import { IVectorStore } from "./interfaces/vector-store"
import { ICodeIndexReranker, RerankerDocument, RerankerResult } from "./interfaces/reranker"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

/**
 * Service responsible for searching the code index.
 */
export class CodeIndexSearchService {
	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		private readonly embedder: IEmbedder,
		private readonly vectorStore: IVectorStore,
		private readonly reranker?: ICodeIndexReranker | null,
	) {}

	/**
	 * Searches the code index for relevant content.
	 * @param query The search query
	 * @param limit Maximum number of results to return
	 * @param directoryPrefix Optional directory path to filter results by
	 * @returns Array of search results
	 * @throws Error if the service is not properly configured or ready
	 */
	public async searchIndex(query: string, directoryPrefix?: string): Promise<VectorStoreSearchResult[]> {
		if (!this.configManager.isFeatureEnabled || !this.configManager.isFeatureConfigured) {
			throw new Error("Code index feature is disabled or not configured.")
		}

		const minScore = this.configManager.currentSearchMinScore
		const maxResults = this.configManager.currentSearchMaxResults

		const currentState = this.stateManager.getCurrentStatus().systemStatus
		if (currentState !== "Indexed" && currentState !== "Indexing") {
			// Allow search during Indexing too
			throw new Error(`Code index is not ready for search. Current state: ${currentState}`)
		}

		try {
			// Generate embedding for query
			const embeddingResponse = await this.embedder.createEmbeddings([query])
			const vector = embeddingResponse?.embeddings[0]
			if (!vector) {
				throw new Error("Failed to generate embedding for query.")
			}

			// Handle directory prefix
			let normalizedPrefix: string | undefined = undefined
			if (directoryPrefix) {
				normalizedPrefix = path.normalize(directoryPrefix)
			}

			// Perform search
			const results = await this.vectorStore.search(vector, normalizedPrefix, minScore, maxResults)

			// Decide if reranking should be applied
			if (!this.reranker || !results || results.length === 0 || this.configManager.isKiloOrgMode) {
				console.log("Skipping reranking due to conditions:", {
					hasReranker: !!this.reranker,
					hasResults: !!results,
					resultsLength: results?.length,
					isKiloOrgMode: this.configManager.isKiloOrgMode,
				})
				return results
			}

			try {
				const reranker = this.reranker
				if (!reranker) {
					return results
				}

				// Build reranker documents from valid payloads
				const documents: RerankerDocument[] = []
				for (let i = 0; i < results.length; i++) {
					const result = results[i]
					const payload = result.payload as any
					if (
						!payload ||
						typeof payload.filePath !== "string" ||
						typeof payload.codeChunk !== "string" ||
						typeof payload.startLine !== "number" ||
						typeof payload.endLine !== "number"
					) {
						continue
					}

					documents.push({
						id: String(i),
						filePath: payload.filePath,
						codeChunk: payload.codeChunk,
						startLine: payload.startLine,
						endLine: payload.endLine,
						originalScore: result.score,
					})
				}

				// If no valid documents remain, skip reranking and return original results
				if (documents.length === 0) {
					return results
				}

				// Call reranker
				const reranked: RerankerResult[] = await reranker.rerank(query, documents)
				if (!reranked || reranked.length === 0) {
					return results
				}

				// Map reranker scores back to results
				const idToScore = new Map<string, number>()
				for (const item of reranked) {
					if (typeof item.id === "string" && typeof item.score === "number") {
						idToScore.set(item.id, item.score)
					}
				}

				if (idToScore.size === 0) {
					return results
				}

				const rerankMinScore = reranker.minScore
				const rerankedResults: VectorStoreSearchResult[] = []
				const filteredOutByRerank: VectorStoreSearchResult[] = []
				const unratedResults: VectorStoreSearchResult[] = []

				for (let i = 0; i < results.length; i++) {
					const id = String(i)
					const newScore = idToScore.get(id)
					const result = results[i]

					// If the reranker didn't return a score for this result, keep it as-is
					// (it already passed the initial vector-store minScore filter).
					if (newScore === undefined || !result.payload) {
						if (result.payload) {
							;(result.payload as any).rerank_filtered = false
						}
						unratedResults.push(result)
						continue
					}

					const payload = result.payload as any
					payload.originalScore ??= result.score
					result.score = newScore

					const passesThreshold = result.score >= rerankMinScore
					payload.rerank_filtered = !passesThreshold

					if (passesThreshold) {
						rerankedResults.push(result)
					} else {
						filteredOutByRerank.push(result)
					}
				}

				// Combine all results so callers can still see items filtered out by reranking.
				// The rerank_filtered flag on the payload tells consumers which ones to hide from LLMs.
				const combinedResults = [...rerankedResults, ...unratedResults, ...filteredOutByRerank]
				combinedResults.sort((a, b) => b.score - a.score)
				return combinedResults
			} catch (err) {
				// Any reranking error should be logged but must not affect outer search behavior
				console.error("[CodeIndexSearchService] Reranking failed:", err)
				return results
			}
		} catch (error) {
			console.error("[CodeIndexSearchService] Error during search:", error)
			this.stateManager.setSystemState("Error", `Search failed: ${(error as Error).message}`)

			// Capture telemetry for the error
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: (error as Error).message,
				stack: (error as Error).stack,
				location: "searchIndex",
			})

			throw error // Re-throw the error after setting state
		}
	}
}
