import { RagNexusError } from "../errors";

/** Thrown by tree-store operations (routing, query, node lookup). */
export class TreeStoreError extends RagNexusError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "TreeStoreError";
    }
}
