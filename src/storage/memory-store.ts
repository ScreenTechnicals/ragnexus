import { MemoryFact, MemoryStore } from "../types";

export class InMemoryStore implements MemoryStore {
    private store: Map<string, MemoryFact[]> = new Map();

    public async get(userId: string): Promise<MemoryFact[]> {
        return this.store.get(userId) || [];
    }

    public async add(userId: string, memory: MemoryFact): Promise<void> {
        const existing = this.store.get(userId) || [];
        this.store.set(userId, [...existing, memory]);
    }

    public async delete(userId: string, memoryId: string): Promise<void> {
        const existing = this.store.get(userId) || [];
        this.store.set(userId, existing.filter(m => m.id !== memoryId));
    }
}
