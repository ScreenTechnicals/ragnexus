/**
 * TextSplitter — splits large documents into smaller overlapping chunks.
 *
 * Why chunking matters:
 *  - Most embedding models have a token limit (~512–8192 tokens).
 *  - A single large scraped page stored as one document leads to low-quality
 *    embeddings and poor retrieval precision.
 *  - Overlapping chunks preserve continuity across chunk boundaries.
 *
 * Usage:
 *   const splitter = new TextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
 *   const chunks = splitter.splitDocuments(docs);
 */

import { RAGDocument } from "../types";
import { sha256 } from "./hash";

export interface TextSplitterOptions {
    /** Target character count per chunk. Default: 1000 */
    chunkSize?: number;
    /** How many characters from the end of each chunk to repeat at the start
     *  of the next one. Preserves context at boundaries. Default: 150 */
    chunkOverlap?: number;
    /** Ordered list of separator strings to try when splitting.
     *  Falls back to the next separator if a chunk is still too large.
     *  Default: ['\n\n', '\n', '. ', ' ', ''] */
    separators?: string[];
}

export class TextSplitter {
    private chunkSize: number;
    private chunkOverlap: number;
    private separators: string[];

    constructor(options: TextSplitterOptions = {}) {
        this.chunkSize = options.chunkSize ?? 1000;
        this.chunkOverlap = options.chunkOverlap ?? 150;
        this.separators = options.separators ?? ['\n\n', '\n', '. ', ' ', ''];

        if (this.chunkOverlap >= this.chunkSize) {
            throw new Error('chunkOverlap must be smaller than chunkSize');
        }
    }

    /**
     * Split a single string of text into an array of overlapping chunks.
     */
    public splitText(text: string): string[] {
        return this.recursiveSplit(text, this.separators);
    }

    /**
     * Split an array of RAGDocuments. Each chunk becomes its own RAGDocument
     * with a deterministic id derived from the parent and chunk index,
     * and with `chunkIndex` / `totalChunks` recorded in metadata.
     */
    public splitDocuments(docs: RAGDocument[]): RAGDocument[] {
        const result: RAGDocument[] = [];

        for (const doc of docs) {
            const chunks = this.splitText(doc.text);
            if (chunks.length === 1) {
                // Don't touch docs that didn't need splitting
                result.push(doc);
                continue;
            }

            chunks.forEach((chunk, idx) => {
                result.push({
                    ...doc,
                    // Deterministic per-chunk id
                    id: sha256(`${doc.id}::chunk::${idx}`),
                    text: chunk,
                    metadata: {
                        ...doc.metadata,
                        chunkIndex: idx,
                        totalChunks: chunks.length,
                        sourceDocId: doc.id,
                    },
                });
            });
        }

        return result;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private recursiveSplit(text: string, separators: string[]): string[] {
        const [separator, ...remaining] = separators;

        // Split the text by the current separator
        const parts = separator === ''
            ? text.split('')         // character-level fallback
            : text.split(separator);

        const goodChunks: string[] = [];
        let currentChunk = '';

        for (const part of parts) {
            const candidate = currentChunk
                ? currentChunk + separator + part
                : part;

            if (candidate.length <= this.chunkSize) {
                currentChunk = candidate;
            } else {
                // currentChunk is ready to emit
                if (currentChunk) {
                    goodChunks.push(...this.mergeSmallParts(currentChunk, separator, remaining));
                }
                currentChunk = part;
            }
        }

        if (currentChunk) {
            goodChunks.push(...this.mergeSmallParts(currentChunk, separator, remaining));
        }

        return this.applyOverlap(goodChunks);
    }

    /** If a part is still too large, recursively split with the next separator. */
    private mergeSmallParts(text: string, separator: string, remaining: string[]): string[] {
        if (text.length <= this.chunkSize || remaining.length === 0) {
            return [text];
        }
        return this.recursiveSplit(text, remaining);
    }

    /**
     * Given a list of non-overlapping chunks, produce the final output by
     * appending the beginning of the next chunk to the end of each current one.
     */
    private applyOverlap(chunks: string[]): string[] {
        if (this.chunkOverlap === 0 || chunks.length <= 1) return chunks;

        const result: string[] = [chunks[0]];
        for (let i = 1; i < chunks.length; i++) {
            const prev = result[i - 1];
            const overlap = prev.slice(-this.chunkOverlap);
            result.push(overlap + chunks[i]);
        }
        return result;
    }
}
