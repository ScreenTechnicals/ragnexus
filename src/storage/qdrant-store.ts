import { Embedder, RAGDocument, UpsertResult, VectorStore } from "../types";
import { sha256 } from "../utils/hash";

// Requires @qdrant/js-client-rest, kept purely as an interface wrap.
// Let the user pass the QdrantClient instance directly.
export interface QdrantClientInstance {
    upsert(collectionName: string, config: { wait: boolean, points: any[] }): Promise<any>;
    delete(collectionName: string, config: { wait: boolean, points: { ids: string[] } }): Promise<any>;
    search(collectionName: string, config: { vector: number[], limit: number, with_payload: boolean }): Promise<any[]>;
    retrieve(collectionName: string, config: { ids: string[], with_payload: boolean }): Promise<any[]>;
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

    // ─── Private helpers ────────────────────────────────────────────────────

    private async embedTexts(texts: string[]): Promise<number[][]> {
        if (this.embedder.embedBatch) {
            return this.embedder.embedBatch(texts);
        }
        return Promise.all(texts.map(t => this.embedder.embed(t)));
    }

    private toPoints(docs: RAGDocument[], vectors: number[][]): any[] {
        return docs.map((doc, i) => ({
            id: doc.id,
            vector: vectors[i],
            payload: {
                text: doc.text,
                source: doc.source,
                contentHash: doc.contentHash,
                updatedAt: doc.updatedAt,
                ...doc.metadata,
            }
        }));
    }

    private mapHit(hit: any): RAGDocument {
        return {
            id: hit.id as string,
            text: hit.payload?.text as string || "",
            source: hit.payload?.source as string,
            contentHash: hit.payload?.contentHash as string,
            updatedAt: hit.payload?.updatedAt as number,
            metadata: hit.payload || {},
            score: hit.score,
        };
    }

    // ─── VectorStore interface ───────────────────────────────────────────────

    public async add(docs: RAGDocument[]): Promise<void> {
        if (!docs.length) return;
        const stamped = docs.map(d => ({
            ...d,
            contentHash: sha256(d.text),
            updatedAt: Date.now(),
        }));
        const vectors = await this.embedTexts(stamped.map(d => d.text));
        await this.client.upsert(this.collectionName, {
            wait: true,
            points: this.toPoints(stamped, vectors),
        });
    }

    /**
     * Upsert with content-hash change detection.
     * Fetches existing payloads from Qdrant to compare hashes before re-embedding.
     */
    public async upsert(docs: RAGDocument[]): Promise<UpsertResult> {
        const result: UpsertResult = { added: 0, updated: 0, skipped: 0 };
        if (!docs.length) return result;

        // Fetch existing docs from Qdrant by ID
        const existingHits = await this.client.retrieve(this.collectionName, {
            ids: docs.map(d => d.id),
            with_payload: true,
        });

        const existingHashMap = new Map<string, string>(
            existingHits.map(hit => [hit.id as string, hit.payload?.contentHash as string])
        );

        const toUpsert: RAGDocument[] = [];
        for (const doc of docs) {
            const incomingHash = sha256(doc.text);
            const existingHash = existingHashMap.get(doc.id);

            if (!existingHash) {
                toUpsert.push({ ...doc, contentHash: incomingHash });
                result.added++;
            } else if (existingHash !== incomingHash) {
                toUpsert.push({ ...doc, contentHash: incomingHash });
                result.updated++;
            } else {
                result.skipped++;
            }
        }

        if (toUpsert.length) {
            const stamped = toUpsert.map(d => ({ ...d, updatedAt: Date.now() }));
            const vectors = await this.embedTexts(stamped.map(d => d.text));
            await this.client.upsert(this.collectionName, {
                wait: true,
                points: this.toPoints(stamped, vectors),
            });
        }

        return result;
    }

    public async delete(ids: string[]): Promise<void> {
        if (!ids.length) return;
        await this.client.delete(this.collectionName, {
            wait: true,
            points: { ids },
        });
    }

    public async search(vector: number[], topK: number = 5): Promise<RAGDocument[]> {
        const results = await this.client.search(this.collectionName, {
            vector,
            limit: topK,
            with_payload: true,
        });
        return results.map(hit => this.mapHit(hit));
    }
}
