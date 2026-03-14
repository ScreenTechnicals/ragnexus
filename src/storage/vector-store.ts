import { Embedder, RAGDocument, SearchMode, UpsertResult, VectorStore } from "../types";
import { sha256 } from "../utils/hash";

export class InMemoryVectorStore implements VectorStore {
    private docs: RAGDocument[] = [];
    private documentVectors: Map<string, number[]> = new Map();
    /** O(1) lookup: doc id → index in this.docs */
    private docIndex: Map<string, number> = new Map();
    private embedder: Embedder;

    // Incremental BM25 state
    private bm25: IncrementalBM25;

    constructor(embedder: Embedder) {
        this.embedder = embedder;
        this.bm25 = new IncrementalBM25();
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private async embedTexts(texts: string[]): Promise<number[][]> {
        if (this.embedder.embedBatch) return this.embedder.embedBatch(texts);
        return Promise.all(texts.map(t => this.embedder.embed(t)));
    }

    private removeById(id: string): void {
        const idx = this.docIndex.get(id);
        if (idx === undefined) return;
        const removed = this.docs[idx];

        // Swap-remove: move last element into the gap
        const last = this.docs[this.docs.length - 1];
        this.docs[idx] = last;
        this.docIndex.set(last.id, idx);
        this.docs.pop();
        this.docIndex.delete(id);
        this.documentVectors.delete(id);

        // Incrementally remove from BM25
        this.bm25.removeDoc(removed);
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
     */
    private bm25Score(query: string, doc: RAGDocument): number {
        return this.bm25.score(query, doc.text);
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
            this.bm25.addDoc(stamped[i]);
        }
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
                this.bm25.addDoc(stamped[i]);
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
                this.bm25.addDoc(stamped[i]);
            }
            result.added = toAdd.length;
        }

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
     * @param vector  The query vector (semantic/hybrid) or ignored (keyword).
     * @param topK    Number of results to return. Default: 5.
     * @param mode    Search mode. Default: 'semantic'.
     * @param alpha   Blend weight for hybrid: 0 = pure keyword, 1 = pure semantic. Default: 0.5.
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
            const queryText = (vector as any as string);
            scored = activeDocs.map(doc => ({
                ...doc,
                score: this.bm25Score(queryText, doc),
            }));

        } else {
            // Hybrid: normalise both score distributions then blend
            const queryText = (vector as any as string);

            const bm25Scores = activeDocs.map(doc => this.bm25Score(queryText, doc));
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

        const bm25Scores = activeDocs.map(doc => this.bm25Score(query, doc));
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

// ─── Incremental BM25 ────────────────────────────────────────────────────────

/**
 * Maintains BM25 statistics incrementally as documents are added/removed,
 * avoiding full index rebuilds on every mutation.
 *
 * Tracks: document count (N), document frequency (df), total token length,
 * and per-document token lengths for IDF recalculation.
 */
class IncrementalBM25 {
    /** Number of documents in the index. */
    private N = 0;
    /** Document frequency: term → number of docs containing the term. */
    private df = new Map<string, number>();
    /** Sum of all document token lengths (for avgDocLen). */
    private totalDocLen = 0;
    /** Per-document token length, keyed by doc id. */
    private docLengths = new Map<string, number>();
    /** Per-document unique term sets, keyed by doc id (for removal). */
    private docTermSets = new Map<string, Set<string>>();

    // Cached IDF values — invalidated on df changes
    private idfCache = new Map<string, number>();
    private idfDirty = true;

    get avgDocLen(): number {
        return this.N === 0 ? 0 : this.totalDocLen / this.N;
    }

    addDoc(doc: RAGDocument): void {
        const terms = tokenize(doc.text);
        const uniqueTerms = new Set(terms);

        this.N++;
        this.totalDocLen += terms.length;
        this.docLengths.set(doc.id, terms.length);
        this.docTermSets.set(doc.id, uniqueTerms);

        for (const term of uniqueTerms) {
            this.df.set(term, (this.df.get(term) ?? 0) + 1);
        }
        this.idfDirty = true;
    }

    removeDoc(doc: RAGDocument): void {
        const uniqueTerms = this.docTermSets.get(doc.id);
        if (!uniqueTerms) return;

        const docLen = this.docLengths.get(doc.id) ?? 0;

        this.N--;
        this.totalDocLen -= docLen;
        this.docLengths.delete(doc.id);
        this.docTermSets.delete(doc.id);

        for (const term of uniqueTerms) {
            const count = (this.df.get(term) ?? 1) - 1;
            if (count <= 0) {
                this.df.delete(term);
            } else {
                this.df.set(term, count);
            }
        }
        this.idfDirty = true;
    }

    /**
     * Score a query against a document using BM25.
     * IDF values are lazily recomputed only when the index has been mutated.
     */
    score(query: string, docText: string): number {
        if (this.N === 0) return 0;

        if (this.idfDirty) {
            this.rebuildIdf();
        }

        const k1 = 1.5, b = 0.75;
        const avgDl = this.avgDocLen;
        const queryTerms = tokenize(query);
        const docTerms = tokenize(docText);
        const docLen = docTerms.length;

        const tf = new Map<string, number>();
        for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);

        let total = 0;
        for (const term of new Set(queryTerms)) {
            const idf = this.idfCache.get(term) ?? 0;
            const freq = tf.get(term) ?? 0;
            const norm = freq * (k1 + 1) / (freq + k1 * (1 - b + b * (docLen / avgDl)));
            total += idf * norm;
        }
        return total;
    }

    /** Rebuild IDF cache from current df/N. Only runs when dirty. */
    private rebuildIdf(): void {
        this.idfCache.clear();
        for (const [term, freq] of this.df) {
            this.idfCache.set(term, Math.log((this.N - freq + 0.5) / (freq + 0.5) + 1));
        }
        this.idfDirty = false;
    }
}

// ─── BM25 helpers ─────────────────────────────────────────────────────────────

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
