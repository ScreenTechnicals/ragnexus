import { Embedder, RAGDocument, SearchMode, UpsertResult, VectorStore } from "../types";
import { sha256 } from "../utils/hash";

export class InMemoryVectorStore implements VectorStore {
    private docs: RAGDocument[] = [];
    private documentVectors: Map<string, number[]> = new Map();
    /** O(1) lookup: doc id → index in this.docs */
    private docIndex: Map<string, number> = new Map();
    private embedder: Embedder;

    // BM25 state — rebuilt lazily on first hybrid/keyword search
    private bm25Index: BM25Index | null = null;

    constructor(embedder: Embedder) {
        this.embedder = embedder;
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private async embedTexts(texts: string[]): Promise<number[][]> {
        if (this.embedder.embedBatch) return this.embedder.embedBatch(texts);
        return Promise.all(texts.map(t => this.embedder.embed(t)));
    }

    private removeById(id: string): void {
        const idx = this.docIndex.get(id);
        if (idx === undefined) return;
        const last = this.docs[this.docs.length - 1];
        this.docs[idx] = last;
        this.docIndex.set(last.id, idx);
        this.docs.pop();
        this.docIndex.delete(id);
        this.documentVectors.delete(id);
        this.bm25Index = null; // invalidate BM25 index
    }

    private stamp(doc: RAGDocument): RAGDocument {
        return { ...doc, contentHash: sha256(doc.text), updatedAt: Date.now() };
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * BM25 scoring for a single query against a single doc.
     * Uses pre-built IDF map from the BM25Index.
     */
    private bm25Score(query: string, doc: RAGDocument, index: BM25Index): number {
        const k1 = 1.5, b = 0.75;
        const queryTerms = tokenize(query);
        const docTerms = tokenize(doc.text);
        const docLen = docTerms.length;

        const tf = new Map<string, number>();
        for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);

        let score = 0;
        for (const term of new Set(queryTerms)) {
            const idf = index.idf.get(term) ?? 0;
            const freq = tf.get(term) ?? 0;
            const norm = freq * (k1 + 1) / (freq + k1 * (1 - b + b * (docLen / index.avgDocLen)));
            score += idf * norm;
        }
        return score;
    }

    private buildBM25Index(): BM25Index {
        if (this.bm25Index) return this.bm25Index;

        const N = this.docs.length;
        if (N === 0) return { idf: new Map(), avgDocLen: 0 };

        const df = new Map<string, number>();
        let totalLen = 0;

        for (const doc of this.docs) {
            const terms = new Set(tokenize(doc.text));
            totalLen += tokenize(doc.text).length;
            for (const t of terms) df.set(t, (df.get(t) ?? 0) + 1);
        }

        const idf = new Map<string, number>();
        for (const [term, freq] of df) {
            idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1));
        }

        this.bm25Index = { idf, avgDocLen: totalLen / N };
        return this.bm25Index;
    }

    // ─── VectorStore interface ────────────────────────────────────────────────

    public async add(docs: RAGDocument[]): Promise<void> {
        const newDocs = docs.filter(d => !this.docIndex.has(d.id));
        if (!newDocs.length) return;

        const stamped = newDocs.map(d => this.stamp(d));
        const vectors = await this.embedTexts(stamped.map(d => d.text));

        for (let i = 0; i < stamped.length; i++) {
            this.docIndex.set(stamped[i].id, this.docs.length);
            this.docs.push(stamped[i]);
            this.documentVectors.set(stamped[i].id, vectors[i]);
        }
        this.bm25Index = null; // invalidate BM25 index
    }

    public async upsert(docs: RAGDocument[]): Promise<UpsertResult> {
        const result: UpsertResult = { added: 0, updated: 0, skipped: 0 };
        if (!docs.length) return result;

        const toAdd: RAGDocument[] = [];
        const toUpdate: RAGDocument[] = [];

        for (const doc of docs) {
            const hash = sha256(doc.text);
            const existingIdx = this.docIndex.get(doc.id);

            if (existingIdx === undefined) {
                toAdd.push({ ...doc, contentHash: hash });
            } else {
                const existing = this.docs[existingIdx];
                if (existing.contentHash === hash) {
                    result.skipped++;
                } else {
                    toUpdate.push({ ...doc, contentHash: hash });
                }
            }
        }

        if (toUpdate.length) {
            toUpdate.map(d => d.id).forEach(id => this.removeById(id));
            const stamped = toUpdate.map(d => this.stamp(d));
            const vectors = await this.embedTexts(stamped.map(d => d.text));
            for (let i = 0; i < stamped.length; i++) {
                this.docIndex.set(stamped[i].id, this.docs.length);
                this.docs.push(stamped[i]);
                this.documentVectors.set(stamped[i].id, vectors[i]);
            }
            result.updated = toUpdate.length;
        }

        if (toAdd.length) {
            const stamped = toAdd.map(d => this.stamp(d));
            const vectors = await this.embedTexts(stamped.map(d => d.text));
            for (let i = 0; i < stamped.length; i++) {
                this.docIndex.set(stamped[i].id, this.docs.length);
                this.docs.push(stamped[i]);
                this.documentVectors.set(stamped[i].id, vectors[i]);
            }
            result.added = toAdd.length;
        }

        this.bm25Index = null; // invalidate BM25 index after any modification
        return result;
    }

    public async delete(ids: string[]): Promise<void> {
        for (const id of ids) this.removeById(id);
    }

    /**
     * Search the store using the specified mode:
     * - **'semantic'** (default): pure cosine similarity on embeddings
     * - **'keyword'**: BM25 keyword scoring — no embedding needed
     * - **'hybrid'**: weighted sum of normalised BM25 + cosine scores
     *
     * @param query   The query vector (semantic) or query string (keyword/hybrid).
     *                For keyword/hybrid, pass the raw query string cast to any —
     *                or use `searchByText()` for a cleaner API.
     * @param topK    Number of results to return. Default: 5.
     * @param mode    Search mode. Default: 'semantic'.
     * @param alpha   Blend weight for hybrid: 0 = pure keyword, 1 = pure semantic.
     *                Default: 0.5.
     */
    public async search(
        vector: number[],
        topK: number = 5,
        mode: SearchMode = 'semantic',
        alpha: number = 0.5
    ): Promise<RAGDocument[]> {
        const now = Date.now();
        const activeDocs = this.docs.filter(
            doc => doc.expiresAt === undefined || doc.expiresAt > now
        );
        if (!activeDocs.length) return [];

        let scored: Array<RAGDocument & { score: number }>;

        if (mode === 'semantic') {
            scored = activeDocs.map(doc => {
                const docVec = this.documentVectors.get(doc.id);
                return { ...doc, score: docVec ? this.cosineSimilarity(vector, docVec) : 0 };
            });

        } else if (mode === 'keyword') {
            // vector[] is actually unused; caller should pass queryText via searchByText
            const queryText = (vector as any as string);
            const idx = this.buildBM25Index();
            scored = activeDocs.map(doc => ({
                ...doc,
                score: this.bm25Score(queryText, doc, idx),
            }));

        } else {
            // Hybrid: normalise both score distributions then blend
            const queryText = (vector as any as string);
            const idx = this.buildBM25Index();

            const bm25Scores = activeDocs.map(doc => this.bm25Score(queryText, doc, idx));
            const cosScores = activeDocs.map(doc => {
                const docVec = this.documentVectors.get(doc.id);
                return docVec ? this.cosineSimilarity(vector, docVec) : 0;
            });

            const maxBm25 = Math.max(...bm25Scores, 1e-9);
            const maxCos = Math.max(...cosScores, 1e-9);

            scored = activeDocs.map((doc, i) => ({
                ...doc,
                score: (1 - alpha) * (bm25Scores[i] / maxBm25) + alpha * (cosScores[i] / maxCos),
            }));
        }

        return scored.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    /**
     * Convenience method for keyword and hybrid search that accepts a text
     * query instead of a pre-computed embedding vector.
     */
    public async searchByText(
        query: string,
        topK: number = 5,
        mode: SearchMode = 'hybrid',
        alpha: number = 0.5
    ): Promise<RAGDocument[]> {
        if (mode === 'keyword') {
            return this.search(query as any, topK, 'keyword', alpha);
        }
        // For semantic or hybrid: embed the query text
        const vector = await this.embedder.embed(query);
        if (mode === 'semantic') return this.search(vector, topK, 'semantic', alpha);
        // Hybrid: pass both — store resolves them internally
        return this.hybridSearch(query, vector, topK, alpha);
    }

    /** Internal: runs hybrid search with both the raw query and its embedding. */
    private async hybridSearch(
        query: string,
        vector: number[],
        topK: number,
        alpha: number
    ): Promise<RAGDocument[]> {
        const now = Date.now();
        const activeDocs = this.docs.filter(
            doc => doc.expiresAt === undefined || doc.expiresAt > now
        );
        if (!activeDocs.length) return [];

        const idx = this.buildBM25Index();
        const bm25Scores = activeDocs.map(doc => this.bm25Score(query, doc, idx));
        const cosScores = activeDocs.map(doc => {
            const docVec = this.documentVectors.get(doc.id);
            return docVec ? this.cosineSimilarity(vector, docVec) : 0;
        });

        const maxBm25 = Math.max(...bm25Scores, 1e-9);
        const maxCos = Math.max(...cosScores, 1e-9);

        return activeDocs
            .map((doc, i) => ({
                ...doc,
                score: (1 - alpha) * (bm25Scores[i] / maxBm25) + alpha * (cosScores[i] / maxCos),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
}

// ─── BM25 helpers ─────────────────────────────────────────────────────────────

interface BM25Index {
    idf: Map<string, number>;
    avgDocLen: number;
}

/** Simple tokenizer: lowercase, split on non-alphanumeric, filter stopwords. */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'this', 'but', 'they', 'have', 'had',
    'what', 'when', 'where', 'who', 'which', 'would', 'could', 'should',
]);
