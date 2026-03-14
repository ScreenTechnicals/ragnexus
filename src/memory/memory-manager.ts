import { MemoryFact, MemoryStore } from "../types";

export class MemoryManager {
    private store: MemoryStore;

    constructor(store: MemoryStore) {
        this.store = store;
    }

    /**
     * Fetch memory facts for a given user.
     */
    public async getMemory(userId: string): Promise<MemoryFact[]> {
        return this.store.get(userId);
    }

    /**
     * Add a memory fact for a user with deduplication.
     *
     * Before persisting, checks existing facts for the same user:
     * - **Exact match**: normalized content is identical → skip.
     * - **Substring containment**: the new fact is already contained within
     *   an existing fact (or vice versa) → skip if existing is more detailed,
     *   or replace if the new fact is more detailed.
     *
     * Returns `true` if the fact was added, `false` if it was a duplicate.
     */
    public async addMemory(
        userId: string,
        fact: Omit<MemoryFact, "id" | "createdAt" | "userId">
    ): Promise<boolean> {
        const existing = await this.store.get(userId);
        const newNorm = normalize(fact.content);

        for (const old of existing) {
            const oldNorm = normalize(old.content);

            // Exact match — skip entirely
            if (newNorm === oldNorm) {
                return false;
            }

            // New fact is a subset of an existing one — skip
            if (oldNorm.includes(newNorm)) {
                return false;
            }

            // Existing fact is a subset of the new one — replace (delete old, add new)
            if (newNorm.includes(oldNorm)) {
                if (this.store.delete) {
                    await this.store.delete(userId, old.id);
                }
                break;
            }
        }

        const memory: MemoryFact = {
            id: crypto.randomUUID(),
            userId,
            createdAt: Date.now(),
            ...fact,
        };

        await this.store.add(userId, memory);
        return true;
    }
}

/**
 * Normalize text for dedup comparison:
 * lowercase, collapse whitespace, trim.
 */
function normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
}
