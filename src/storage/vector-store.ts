import { Embedder, RAGDocument, VectorStore } from "../types";

export class InMemoryVectorStore implements VectorStore {
    private docs: RAGDocument[] = [];
    private documentVectors: Map<string, number[]> = new Map();
    private embedder: Embedder;

    constructor(embedder: Embedder) {
        this.embedder = embedder;
    }

    public async add(docs: RAGDocument[]): Promise<void> {
        for (const doc of docs) {
            this.docs.push(doc);
            // Generate embedding for storage
            const vector = await this.embedder.embed(doc.text);
            this.documentVectors.set(doc.id, vector);
        }
    }

    public async search(vector: number[], topK: number = 5): Promise<RAGDocument[]> {
        const scoredDocs = this.docs.map(doc => {
            const docVector = this.documentVectors.get(doc.id);
            if (!docVector) return { ...doc, score: 0 };

            const score = this.cosineSimilarity(vector, docVector);
            return { ...doc, score };
        });

        // Sort by descending score
        return scoredDocs.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK);
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
