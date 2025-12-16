import { Task } from "../task/Task"
import { ClineMessage } from "@roo-code/types"
import { ApiMessage } from "../task-persistence/apiMessages"
import { cleanupAfterTruncation } from "../condense"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

// Toggle this to enable/disable Desktop logs for the anchored-range deletion ("X" button)
const EXPORT_API_HISTORY_ON_ANCHOR_DELETE = true

export interface RewindOptions {
	/** Whether to include the target message in deletion (edit=true, delete=false) */
	includeTargetMessage?: boolean
	/** Skip cleanup for special cases (default: false) */
	skipCleanup?: boolean
}

interface ContextEventIds {
	condenseIds: Set<string>
	truncationIds: Set<string>
}

/**
 * MessageManager provides centralized handling for all conversation rewind operations.
 *
 * This ensures that whenever UI chat history is rewound (delete, edit, checkpoint restore, etc.),
 * the API conversation history is properly maintained, including:
 * - Removing orphaned Summary messages when their condense_context is removed
 * - Removing orphaned truncation markers when their sliding_window_truncation is removed
 * - Cleaning up orphaned condenseParent/truncationParent tags
 *
 * Usage (always access via Task.messageManager getter):
 * ```typescript
 * await task.messageManager.rewindToTimestamp(messageTs, { includeTargetMessage: false })
 * ```
 *
 * @see Task.messageManager - The getter that provides lazy-initialized access to this manager
 */
export class MessageManager {
	constructor(private task: Task) {}

	private isAnchorMessage(msg: ClineMessage | undefined): boolean {
		return !!msg && msg.type === "say" && (msg.say === "api_req_started" || msg.say === "user_feedback")
	}

	private async exportApiHistorySnapshotToDesktopLogs(params: {
		when: "pre" | "post"
		runId: number
		anchorTs: number
		anchorKind: "api_req_started" | "user_feedback"
		history: ApiMessage[]
	}): Promise<void> {
		try {
			const logsDir = path.join(os.homedir(), "Desktop", "logs")
			await fs.mkdir(logsDir, { recursive: true })

			const sanitizedHistory = params.history.map((msg) => {
				if (msg?.role === "assistant") {
					const cloned: any = { ...(msg as any) }
					delete cloned.reasoning_details
					return cloned
				}
				return msg
			})

			const payload = {
				meta: {
					operation: "deleteAnchorRange",
					when: params.when,
					runId: params.runId,
					anchorTs: params.anchorTs,
					anchorKind: params.anchorKind,
					exportedAt: Date.now(),
				},
				apiHistory: sanitizedHistory,
			}

			const fileName = `apiHistory-${params.when}-deleteAnchorRange-${params.anchorKind}-${params.anchorTs}-${params.runId}.json`
			const filePath = path.join(logsDir, fileName)
			await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8")
		} catch (error) {
			console.error("[MessageManager] Failed to export apiHistory snapshot:", error)
		}
	}

	private collectRemovedContextEventIdsInRange(fromIndex: number, toIndex: number): ContextEventIds {
		const condenseIds = new Set<string>()
		const truncationIds = new Set<string>()

		const start = Math.max(0, fromIndex)
		const end = Math.min(this.task.clineMessages.length, toIndex)
		for (let i = start; i < end; i++) {
			const msg = this.task.clineMessages[i]

			// Collect condenseIds from condense_context events
			if (msg.say === "condense_context" && msg.contextCondense?.condenseId) {
				condenseIds.add(msg.contextCondense.condenseId)
				console.log(
					`[MessageManager] Found condense_context to remove (range): ${msg.contextCondense.condenseId}`,
				)
			}

			// Collect truncationIds from sliding_window_truncation events
			if (msg.say === "sliding_window_truncation" && msg.contextTruncation?.truncationId) {
				truncationIds.add(msg.contextTruncation.truncationId)
				console.log(
					`[MessageManager] Found sliding_window_truncation to remove (range): ${msg.contextTruncation.truncationId}`,
				)
			}
		}

		return { condenseIds, truncationIds }
	}

	/**
	 * Delete an anchored UI range and its corresponding single API history message.
	 *
	 * UI deletion rule: delete clineMessages in [anchorTs, nextAnchorTs)
	 * where nextAnchorTs is the next message whose say is api_req_started or user_feedback.
	 *
	 * API deletion rule:
	 * - user_feedback: remove first apiConversationHistory message with role=user and ts > anchorTs
	 * - api_req_started: remove first apiConversationHistory message with role=assistant and ts > anchorTs
	 *
	 * This is intentionally NOT a rewind/truncate-from-point operation.
	 */
	async deleteAnchorRange(anchorTs: number, anchorKind: "api_req_started" | "user_feedback"): Promise<boolean> {
		const exportRunId = Date.now()

		const startIndex = this.task.clineMessages.findIndex((m) => m.ts === anchorTs)
		if (startIndex === -1) {
			console.warn(`[MessageManager] deleteAnchorRange: anchorTs not found in clineMessages: ${anchorTs}`)
			return false
		}

		const startMsg = this.task.clineMessages[startIndex]
		if (!this.isAnchorMessage(startMsg) || startMsg.say !== anchorKind) {
			console.warn(
				`[MessageManager] deleteAnchorRange: anchorTs ${anchorTs} is not an anchor of kind ${anchorKind}`,
			)
			return false
		}

		let endIndex = this.task.clineMessages.length
		for (let i = startIndex + 1; i < this.task.clineMessages.length; i++) {
			if (this.isAnchorMessage(this.task.clineMessages[i])) {
				endIndex = i
				break
			}
		}

		// Step 1: Collect context event IDs from messages being removed
		const removedIds = this.collectRemovedContextEventIdsInRange(startIndex, endIndex)

		// Step 2: Delete the UI range without truncating the tail
		const newClineMessages = this.task.clineMessages
			.slice(0, startIndex)
			.concat(this.task.clineMessages.slice(endIndex))
		await this.task.overwriteClineMessages(newClineMessages)

		// Step 3: Delete one mapped API history message (role-based, ts > anchorTs)
		const originalHistory = this.task.apiConversationHistory

		if (EXPORT_API_HISTORY_ON_ANCHOR_DELETE) {
			await this.exportApiHistorySnapshotToDesktopLogs({
				when: "pre",
				runId: exportRunId,
				anchorTs,
				anchorKind,
				history: originalHistory,
			})
		}

		let apiHistory = [...originalHistory]
		const targetRole = anchorKind === "user_feedback" ? "user" : "assistant"
		const apiIndex = apiHistory.findIndex(
			(m) => m?.role === targetRole && typeof m.ts === "number" && (m.ts as number) > anchorTs,
		)
		if (apiIndex !== -1) {
			apiHistory.splice(apiIndex, 1)
		}

		// Step 4: Remove Summaries / truncation markers whose UI context events were removed
		if (removedIds.condenseIds.size > 0) {
			apiHistory = apiHistory.filter((msg) => {
				if (msg.isSummary && msg.condenseId && removedIds.condenseIds.has(msg.condenseId)) {
					console.log(`[MessageManager] Removing orphaned Summary with condenseId: ${msg.condenseId}`)
					return false
				}
				return true
			})
		}

		if (removedIds.truncationIds.size > 0) {
			apiHistory = apiHistory.filter((msg) => {
				if (msg.isTruncationMarker && msg.truncationId && removedIds.truncationIds.has(msg.truncationId)) {
					console.log(
						`[MessageManager] Removing orphaned truncation marker with truncationId: ${msg.truncationId}`,
					)
					return false
				}
				return true
			})
		}

		// Step 5: Cleanup orphaned tags (condenseParent / truncationParent)
		apiHistory = cleanupAfterTruncation(apiHistory)

		if (EXPORT_API_HISTORY_ON_ANCHOR_DELETE) {
			await this.exportApiHistorySnapshotToDesktopLogs({
				when: "post",
				runId: exportRunId,
				anchorTs,
				anchorKind,
				history: apiHistory,
			})
		}

		const historyChanged =
			apiHistory.length !== originalHistory.length || apiHistory.some((msg, i) => msg !== originalHistory[i])
		if (historyChanged) {
			await this.task.overwriteApiConversationHistory(apiHistory)
		}

		return true
	}

	/**
	 * Rewind conversation to a specific timestamp.
	 * This is the SINGLE entry point for all message deletion operations.
	 *
	 * @param ts - The timestamp to rewind to
	 * @param options - Rewind options
	 * @throws Error if timestamp not found in clineMessages
	 */
	async rewindToTimestamp(ts: number, options: RewindOptions = {}): Promise<void> {
		const { includeTargetMessage = false, skipCleanup = false } = options

		// Find the index in clineMessages
		const clineIndex = this.task.clineMessages.findIndex((m) => m.ts === ts)
		if (clineIndex === -1) {
			throw new Error(`Message with timestamp ${ts} not found in clineMessages`)
		}

		// Calculate the actual cutoff index
		const cutoffIndex = includeTargetMessage ? clineIndex + 1 : clineIndex

		await this.performRewind(cutoffIndex, ts, { skipCleanup })
	}

	/**
	 * Rewind conversation to a specific index in clineMessages.
	 * Keeps messages [0, toIndex) and removes [toIndex, end].
	 *
	 * @param toIndex - The index to rewind to (exclusive)
	 * @param options - Rewind options
	 */
	async rewindToIndex(toIndex: number, options: RewindOptions = {}): Promise<void> {
		const cutoffTs = this.task.clineMessages[toIndex]?.ts ?? Date.now()
		await this.performRewind(toIndex, cutoffTs, options)
	}

	/**
	 * Internal method that performs the actual rewind operation.
	 */
	private async performRewind(toIndex: number, cutoffTs: number, options: RewindOptions): Promise<void> {
		const { skipCleanup = false } = options

		// Step 1: Collect context event IDs from messages being removed
		const removedIds = this.collectRemovedContextEventIds(toIndex)

		// Step 2: Truncate clineMessages
		await this.truncateClineMessages(toIndex)

		// Step 3: Truncate and clean API history (combined with cleanup for efficiency)
		await this.truncateApiHistoryWithCleanup(cutoffTs, removedIds, skipCleanup)
	}

	/**
	 * Collect condenseIds and truncationIds from context-management events
	 * that will be removed during the rewind.
	 *
	 * This is critical for maintaining the linkage between:
	 * - condense_context (clineMessage) ↔ Summary (apiMessage)
	 * - sliding_window_truncation (clineMessage) ↔ Truncation marker (apiMessage)
	 */
	private collectRemovedContextEventIds(fromIndex: number): ContextEventIds {
		const condenseIds = new Set<string>()
		const truncationIds = new Set<string>()

		for (let i = fromIndex; i < this.task.clineMessages.length; i++) {
			const msg = this.task.clineMessages[i]

			// Collect condenseIds from condense_context events
			if (msg.say === "condense_context" && msg.contextCondense?.condenseId) {
				condenseIds.add(msg.contextCondense.condenseId)
				console.log(`[MessageManager] Found condense_context to remove: ${msg.contextCondense.condenseId}`)
			}

			// Collect truncationIds from sliding_window_truncation events
			if (msg.say === "sliding_window_truncation" && msg.contextTruncation?.truncationId) {
				truncationIds.add(msg.contextTruncation.truncationId)
				console.log(
					`[MessageManager] Found sliding_window_truncation to remove: ${msg.contextTruncation.truncationId}`,
				)
			}
		}

		return { condenseIds, truncationIds }
	}

	/**
	 * Truncate clineMessages to the specified index.
	 */
	private async truncateClineMessages(toIndex: number): Promise<void> {
		await this.task.overwriteClineMessages(this.task.clineMessages.slice(0, toIndex))
	}

	/**
	 * Truncate API history by timestamp, remove orphaned summaries/markers,
	 * and clean up orphaned tags - all in a single write operation.
	 *
	 * This combined approach:
	 * 1. Avoids multiple writes to API history
	 * 2. Only writes if the history actually changed
	 * 3. Handles both truncation and cleanup atomically
	 */
	private async truncateApiHistoryWithCleanup(
		cutoffTs: number,
		removedIds: ContextEventIds,
		skipCleanup: boolean,
	): Promise<void> {
		const originalHistory = this.task.apiConversationHistory
		let apiHistory = [...originalHistory]

		// Step 1: Filter by timestamp
		apiHistory = apiHistory.filter((m) => !m.ts || m.ts < cutoffTs)

		// Step 2: Remove Summaries whose condense_context was removed
		if (removedIds.condenseIds.size > 0) {
			apiHistory = apiHistory.filter((msg) => {
				if (msg.isSummary && msg.condenseId && removedIds.condenseIds.has(msg.condenseId)) {
					console.log(`[MessageManager] Removing orphaned Summary with condenseId: ${msg.condenseId}`)
					return false
				}
				return true
			})
		}

		// Step 3: Remove truncation markers whose sliding_window_truncation was removed
		if (removedIds.truncationIds.size > 0) {
			apiHistory = apiHistory.filter((msg) => {
				if (msg.isTruncationMarker && msg.truncationId && removedIds.truncationIds.has(msg.truncationId)) {
					console.log(
						`[MessageManager] Removing orphaned truncation marker with truncationId: ${msg.truncationId}`,
					)
					return false
				}
				return true
			})
		}

		// Step 4: Cleanup orphaned tags (unless skipped)
		if (!skipCleanup) {
			apiHistory = cleanupAfterTruncation(apiHistory)
		}

		// Only write if the history actually changed
		const historyChanged =
			apiHistory.length !== originalHistory.length || apiHistory.some((msg, i) => msg !== originalHistory[i])

		if (historyChanged) {
			await this.task.overwriteApiConversationHistory(apiHistory)
		}
	}
}
