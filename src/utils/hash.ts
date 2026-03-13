import { createHash } from 'crypto';

/**
 * Compute a SHA-256 hex digest of any UTF-8 string.
 * Used for deterministic document IDs and content change detection.
 */
export function sha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
