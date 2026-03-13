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
     * Extract memory from messages and persist it.
     * This is a placeholder for automatic memory extraction using an LLM.
     * In a real system, you'd pass the new message sequence to an LLM,
     * ask it to extract facts/preferences, and then call this method.
     */
    public async addMemory(userId: string, fact: Omit<MemoryFact, "id" | "createdAt" | "userId">): Promise<void> {
        const memory: MemoryFact = {
            id: crypto.randomUUID(),
            userId,
            createdAt: Date.now(),
            ...fact,
        };

        await this.store.add(userId, memory);
    }
}
