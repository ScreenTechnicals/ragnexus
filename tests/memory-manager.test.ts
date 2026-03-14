import { describe, it, expect } from "vitest";
import { MemoryManager } from "../src/memory/memory-manager";
import { InMemoryStore } from "../src/storage/memory-store";

function createManager() {
    return new MemoryManager(new InMemoryStore());
}

describe("MemoryManager", () => {
    describe("addMemory", () => {
        it("should add a new fact and return true", async () => {
            const mgr = createManager();
            const added = await mgr.addMemory("user-1", {
                type: "fact",
                content: "User likes TypeScript",
                importance: 0.8,
            });

            expect(added).toBe(true);
            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(1);
            expect(facts[0].content).toBe("User likes TypeScript");
            expect(facts[0].userId).toBe("user-1");
        });

        it("should assign id, userId, and createdAt automatically", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", {
                type: "preference",
                content: "Prefers dark mode",
                importance: 0.6,
            });

            const facts = await mgr.getMemory("user-1");
            expect(facts[0].id).toBeDefined();
            expect(facts[0].userId).toBe("user-1");
            expect(facts[0].createdAt).toBeDefined();
        });
    });

    describe("deduplication", () => {
        it("should skip exact duplicate content", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });
            const added = await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });

            expect(added).toBe(false);
            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(1);
        });

        it("should skip case-insensitive duplicates", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });
            const added = await mgr.addMemory("user-1", { type: "fact", content: "user likes python", importance: 0.7 });

            expect(added).toBe(false);
            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(1);
        });

        it("should skip duplicates with different whitespace", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "User likes  Python", importance: 0.7 });
            const added = await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });

            expect(added).toBe(false);
        });

        it("should skip if new fact is a subset of an existing fact", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "User likes Python and JavaScript", importance: 0.7 });
            const added = await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });

            expect(added).toBe(false);
            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(1);
            expect(facts[0].content).toBe("User likes Python and JavaScript");
        });

        it("should replace existing fact if new fact is more detailed (superset)", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "User likes Python", importance: 0.7 });
            const added = await mgr.addMemory("user-1", { type: "fact", content: "User likes Python and JavaScript", importance: 0.8 });

            expect(added).toBe(true);
            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(1);
            expect(facts[0].content).toBe("User likes Python and JavaScript");
        });

        it("should allow different facts for different users", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "Likes Python", importance: 0.7 });
            const added = await mgr.addMemory("user-2", { type: "fact", content: "Likes Python", importance: 0.7 });

            expect(added).toBe(true);
            expect(await mgr.getMemory("user-1")).toHaveLength(1);
            expect(await mgr.getMemory("user-2")).toHaveLength(1);
        });

        it("should allow distinct facts for the same user", async () => {
            const mgr = createManager();
            await mgr.addMemory("user-1", { type: "fact", content: "Likes Python", importance: 0.7 });
            await mgr.addMemory("user-1", { type: "preference", content: "Prefers dark mode", importance: 0.6 });

            const facts = await mgr.getMemory("user-1");
            expect(facts).toHaveLength(2);
        });
    });

    describe("getMemory", () => {
        it("should return empty array for unknown user", async () => {
            const mgr = createManager();
            const facts = await mgr.getMemory("nonexistent");
            expect(facts).toEqual([]);
        });
    });
});
