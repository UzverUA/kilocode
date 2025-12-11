export interface RerankerDocument {
	id: string
	filePath: string
	codeChunk: string
	startLine: number
	endLine: number
	originalScore: number
}

export interface RerankerResult {
	id: string
	score: number
}

export interface ICodeIndexReranker {
	// only to have all config vars in the same place, so minscore here is just for transfering
	minScore: number
	rerank(query: string, documents: RerankerDocument[]): Promise<RerankerResult[]>
}
