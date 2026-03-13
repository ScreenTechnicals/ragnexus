import { Embedder, RAGDocument, VectorStore } from "../types";

// Requires @qdrant/js-client-rest, kept purely as an interface wrap.
// Let the user pass the QdrantClient instance directly.
export interface QdrantClientInstance {
    upsert(collectionName: string, config: { wait: boolean, points: any[] }): Promise<any>;
    search(collectionName: string, config: { vector: number[], limit: number }): Promise<any[]>;
}

export class QdrantVectorStore implements VectorStore {
    private client: QdrantClientInstance;
    private collectionName: string;
    private embedder: Embedder;

    constructor(client: QdrantClientInstance, embedder: Embedder, collectionName = "knowledge_base") {
        this.client = client;
        this.embedder = embedder;
        this.collectionName = collectionName;
    }

    public async add(docs: RAGDocument[]): Promise<void> {
        if (!docs.length) return;

        const vectors = await this.embedder.embedBatch?.(docs.map(d => d.text))
            || await Promise.all(docs.map(d => this.embedder.embed(d.text)));

        const points = docs.map((doc, i) => ({
            id: doc.id,
            vector: vectors[i],
            payload: {
                text: doc.text,
                source: doc.source,
                ...doc.metadata
            }
        }));

        await this.client.upsert(this.collectionName, {
            wait: true,
            points
        });
    }

    public async search(vector: number[], topK: number = 5): Promise<RAGDocument[]> {
        const results = await this.client.search(this.collectionName, {
            vector: vector,
            limit: topK
        });

        // Map Qdrant structure back to RAGDocument
        return results.map(hit => ({
            id: hit.id as string,
            text: hit.payload?.text as string || "",
            source: hit.payload?.source as string,
            metadata: hit.payload || {},
            score: hit.score
        }));
    }
}
