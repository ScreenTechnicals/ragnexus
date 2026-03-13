import { MemoryFact, MemoryStore } from "../types";

// Requires ioredis or similar, kept uninstalled for pure abstraction, 
// assuming user instantiates it and passes it in if using standard redis commands
export interface RedisClient {
    zadd(key: string, score: number, member: string): Promise<any>;
    zrevrange(key: string, start: number, stop: number): Promise<string[]>;
    zrem(key: string, member: string): Promise<any>;
}

export class RedisMemoryStore implements MemoryStore {
    private redis: RedisClient;
    private prefix: string;

    constructor(redisClient: RedisClient, prefix = "memory:") {
        this.redis = redisClient;
        this.prefix = prefix;
    }

    private getKey(userId: string) {
        return `${this.prefix}${userId}`;
    }

    public async get(userId: string): Promise<MemoryFact[]> {
        const key = this.getKey(userId);
        // Fetch top memory facts by priority/importance
        // ZREVRANGE returns array of JS strings 
        const results = await this.redis.zrevrange(key, 0, -1);
        return results.map(res => JSON.parse(res) as MemoryFact);
    }

    public async add(userId: string, memory: MemoryFact): Promise<void> {
        const key = this.getKey(userId);
        // Score is importance. We can use importance * 100 to make it an integer or store floats in Redis
        await this.redis.zadd(key, memory.importance, JSON.stringify(memory));
    }

    public async delete(userId: string, memoryId: string): Promise<void> {
        // Requires iterating or keeping a secondary hash to find the exact payload to remove.
        // For simplicity we fetch mems, find the one with matching id, and zrem.
        const facts = await this.get(userId);
        const target = facts.find(f => f.id === memoryId);
        if (target) {
            await this.redis.zrem(this.getKey(userId), JSON.stringify(target));
        }
    }
}
