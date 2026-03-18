import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Box, render, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import OpenAI from 'openai';
import { useCallback, useRef, useState } from 'react';
import {
    createRag,
    InMemoryStore,
    InMemoryVectorStore,
    OpenAIAdapter,
    OpenAIEmbedder,
    TextSplitter,
    WebCrawler,
} from "../src";
import { TreeStore } from "../src/tree-store";
import type { TreeSpec } from "../src/tree-store";

// ─── Terminal markdown renderer ───────────────────────────────────────────────
// Lightweight ANSI renderer — no external deps, works reliably with Ink's <Text>
// Supports: headings, bold, italic, code, lists, tables, and flow diagrams

const ANSI = {
    bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
    italic: (s: string) => `\x1b[3m${s}\x1b[23m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
    green: (s: string) => `\x1b[32m${s}\x1b[39m`,
    gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
    magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
    white: (s: string) => `\x1b[37m${s}\x1b[39m`,
};

// ─── Table renderer ──────────────────────────────────────────────────────────

function renderTable(rows: string[][]): string {
    if (rows.length === 0) return '';

    // Calculate column widths
    const colCount = Math.max(...rows.map(r => r.length));
    const colWidths: number[] = Array(colCount).fill(0);
    for (const row of rows) {
        for (let c = 0; c < colCount; c++) {
            const cell = (row[c] || '').trim();
            colWidths[c] = Math.max(colWidths[c], cell.length);
        }
    }

    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
    const topBorder    = '  ┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    const midBorder    = '  ├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    const bottomBorder = '  └' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

    const renderRow = (row: string[], style?: (s: string) => string) => {
        const cells = colWidths.map((w, c) => {
            const cell = pad((row[c] || '').trim(), w);
            return style ? style(cell) : formatInline(cell);
        });
        return '  │ ' + cells.join(' │ ') + ' │';
    };

    const out: string[] = [topBorder];

    for (let r = 0; r < rows.length; r++) {
        // Skip separator rows (---|---|---)
        if (rows[r].every(cell => /^[-:]+$/.test(cell.trim()))) {
            out.push(midBorder);
            continue;
        }
        // First row (header) gets bold
        if (r === 0) {
            out.push(renderRow(rows[r], ANSI.bold));
            // If next row isn't a separator, add one
            if (r + 1 >= rows.length || !rows[r + 1].every(cell => /^[-:]+$/.test(cell.trim()))) {
                out.push(midBorder);
            }
        } else {
            out.push(renderRow(rows[r]));
        }
    }

    out.push(bottomBorder);
    return out.join('\n');
}

// ─── Flow diagram renderer ───────────────────────────────────────────────────
//
// Parses mermaid-style syntax inside ```mermaid or ```flow code blocks:
//
//   flowchart LR
//     A[Start] --> B[Process] --> C[End]
//
//   flowchart TD
//     A[Start] --> B[Process]
//     B --> C[End]

interface FlowNode { id: string; label: string }
interface FlowEdge { from: string; to: string; label?: string }

function parseFlowchart(lines: string[]): { nodes: FlowNode[]; edges: FlowEdge[]; direction: 'LR' | 'TD' } {
    let direction: 'LR' | 'TD' = 'LR';
    const nodeMap = new Map<string, FlowNode>();
    const edges: FlowEdge[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('%%')) continue;

        // Direction declaration
        const dirMatch = line.match(/^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)/i);
        if (dirMatch) {
            const d = dirMatch[1].toUpperCase();
            direction = (d === 'TD' || d === 'TB' || d === 'BT') ? 'TD' : 'LR';
            continue;
        }

        // Parse chain: A[Label] --> B[Label] --> C[Label]
        // Also supports A --> B, A -->|edge label| B
        const tokens = line.split(/\s*(-->|---)\s*/);
        let prevId: string | null = null;

        for (const token of tokens) {
            if (token === '-->' || token === '---') continue;

            // Parse node: ID or ID[Label] or ID(Label) or ID{Label}
            const nodeMatch = token.match(/^([A-Za-z0-9_]+)(?:[\[({](.+?)[\])}])?$/);
            if (nodeMatch) {
                const id = nodeMatch[1];
                const label = nodeMatch[2] || id;
                if (!nodeMap.has(id)) {
                    nodeMap.set(id, { id, label });
                } else if (nodeMatch[2]) {
                    // Update label if a new one is provided
                    nodeMap.get(id)!.label = label;
                }
                if (prevId) {
                    edges.push({ from: prevId, to: id });
                }
                prevId = id;
            } else {
                // Edge label syntax: |label| NodeId
                const edgeLabelMatch = token.match(/^\|(.+?)\|\s*([A-Za-z0-9_]+)(?:[\[({](.+?)[\])}])?$/);
                if (edgeLabelMatch) {
                    const edgeLabel = edgeLabelMatch[1];
                    const id = edgeLabelMatch[2];
                    const label = edgeLabelMatch[3] || id;
                    if (!nodeMap.has(id)) {
                        nodeMap.set(id, { id, label });
                    } else if (edgeLabelMatch[3]) {
                        nodeMap.get(id)!.label = label;
                    }
                    if (prevId) {
                        edges.push({ from: prevId, to: id, label: edgeLabel });
                    }
                    prevId = id;
                }
            }
        }
    }

    return { nodes: Array.from(nodeMap.values()), edges, direction };
}

function renderFlowHorizontal(nodes: FlowNode[], edges: FlowEdge[]): string {
    if (nodes.length === 0) return '';

    // Build adjacency to determine order (simple topological-ish)
    const ordered = orderNodes(nodes, edges);

    // Render each node as a box
    const boxes = ordered.map(n => {
        const w = n.label.length + 2;
        return {
            id: n.id,
            label: n.label,
            width: w,
            top:    '┌' + '─'.repeat(w) + '┐',
            mid:    '│ ' + ANSI.bold(ANSI.cyan(n.label)) + ' │',
            bottom: '└' + '─'.repeat(w) + '┘',
        };
    });

    // Build arrow strings between boxes
    const arrowMap = new Map<string, string>();
    for (const e of edges) {
        const key = `${e.from}->${e.to}`;
        if (e.label) {
            const lbl = ` ${e.label} `;
            const padded = '─'.repeat(Math.max(1, Math.floor((lbl.length) / 2)));
            arrowMap.set(key, `${padded}${ANSI.yellow(lbl)}${padded}▶`);
        } else {
            arrowMap.set(key, '───▶');
        }
    }

    // Build three lines: top, mid, bottom
    const topLine: string[] = [];
    const midLine: string[] = [];
    const botLine: string[] = [];

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        topLine.push(box.top);
        midLine.push(box.mid);
        botLine.push(box.bottom);

        if (i < boxes.length - 1) {
            const next = boxes[i + 1];
            const edgeKey = `${box.id}->${next.id}`;
            const arrow = arrowMap.get(edgeKey) || '───▶';
            const arrowLen = arrow.replace(/\x1b\[[0-9;]*m/g, '').length;
            topLine.push(' '.repeat(arrowLen));
            midLine.push(arrow);
            botLine.push(' '.repeat(arrowLen));
        }
    }

    return [
        '  ' + topLine.join(''),
        '  ' + midLine.join(''),
        '  ' + botLine.join(''),
    ].join('\n');
}

function renderFlowVertical(nodes: FlowNode[], edges: FlowEdge[]): string {
    if (nodes.length === 0) return '';

    const ordered = orderNodes(nodes, edges);

    // Find max label width for centering
    const maxWidth = Math.max(...ordered.map(n => n.label.length + 2));

    const out: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
        const n = ordered[i];
        const w = n.label.length + 2;
        const boxPad = Math.floor((maxWidth - w) / 2);
        const indent = ' '.repeat(boxPad + 2);
        const centerPipe = ' '.repeat(Math.floor(maxWidth / 2) + 2);

        out.push(indent + '┌' + '─'.repeat(w) + '┐');
        out.push(indent + '│ ' + ANSI.bold(ANSI.cyan(n.label)) + ' │');
        out.push(indent + '└' + '─'.repeat(w) + '┘');

        if (i < ordered.length - 1) {
            // Find edge label
            const edge = edges.find(e => e.from === n.id && e.to === ordered[i + 1].id);
            if (edge?.label) {
                out.push(centerPipe + '│');
                out.push(centerPipe + ANSI.yellow(edge.label));
                out.push(centerPipe + '│');
            } else {
                out.push(centerPipe + '│');
            }
            out.push(centerPipe + '▼');
        }
    }

    return out.join('\n');
}

function orderNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
    // Simple topological sort via BFS from roots
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) {
        inDegree.set(n.id, 0);
        adj.set(n.id, []);
    }
    for (const e of edges) {
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
        adj.get(e.from)?.push(e.to);
    }

    const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
    const visited = new Set<string>();
    const result: FlowNode[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        result.push(nodeMap.get(id)!);
        for (const next of adj.get(id) || []) {
            inDegree.set(next, (inDegree.get(next) || 0) - 1);
            if ((inDegree.get(next) || 0) <= 0) queue.push(next);
        }
    }

    // Append any unvisited nodes (cycles or disconnected)
    for (const n of nodes) {
        if (!visited.has(n.id)) result.push(n);
    }
    return result;
}

function renderFlowchart(lines: string[]): string {
    const { nodes, edges, direction } = parseFlowchart(lines);
    if (nodes.length === 0) return lines.map(l => ANSI.dim(`  ${l}`)).join('\n');

    return direction === 'TD'
        ? renderFlowVertical(nodes, edges)
        : renderFlowHorizontal(nodes, edges);
}

// ─── Main renderer ───────────────────────────────────────────────────────────

function renderMd(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines: string[] = [];
    let tableBuffer: string[][] = [];

    const flushTable = () => {
        if (tableBuffer.length > 0) {
            out.push(renderTable(tableBuffer));
            tableBuffer = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Fenced code blocks
        const fenceMatch = line.trimStart().match(/^```(\w*)/);
        if (fenceMatch && (inCodeBlock || fenceMatch[0] === line.trimStart().slice(0, fenceMatch[0].length))) {
            if (!inCodeBlock) {
                flushTable();
                inCodeBlock = true;
                codeBlockLang = fenceMatch[1].toLowerCase();
                codeBlockLines = [];
                continue;
            } else {
                // End of code block — render based on language
                if (codeBlockLang === 'mermaid' || codeBlockLang === 'flow' || codeBlockLang === 'flowchart') {
                    out.push(renderFlowchart(codeBlockLines));
                } else {
                    out.push(ANSI.dim('  ──────────'));
                    for (const cl of codeBlockLines) {
                        out.push(ANSI.dim(`  ${cl}`));
                    }
                    out.push(ANSI.dim('  ──────────'));
                }
                inCodeBlock = false;
                codeBlockLang = '';
                codeBlockLines = [];
                continue;
            }
        }
        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // Table rows: | cell | cell | cell |
        const isTableRow = /^\|(.+)\|$/.test(line.trim());
        if (isTableRow) {
            const cells = line.trim().slice(1, -1).split('|');
            tableBuffer.push(cells);
            continue;
        } else {
            flushTable();
        }

        // Headings
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
            out.push('');
            out.push(ANSI.bold(ANSI.cyan(headingMatch[2])));
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            out.push(ANSI.dim('────────────────────────────'));
            continue;
        }

        // Bullet list items
        const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
        if (bulletMatch) {
            const indent = bulletMatch[1] || '';
            line = `${indent}  ${ANSI.cyan('•')} ${bulletMatch[2]}`;
            out.push(formatInline(line));
            continue;
        }

        // Numbered list items
        const numMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)/);
        if (numMatch) {
            const indent = numMatch[1] || '';
            line = `${indent}  ${ANSI.yellow(numMatch[2] + '.')} ${numMatch[3]}`;
            out.push(formatInline(line));
            continue;
        }

        out.push(formatInline(line));
    }

    // Flush any remaining table/code block
    flushTable();
    if (inCodeBlock) {
        out.push(ANSI.dim('  ──────────'));
        for (const cl of codeBlockLines) out.push(ANSI.dim(`  ${cl}`));
        out.push(ANSI.dim('  ──────────'));
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatInline(line: string): string {
    // Inline code (before bold/italic so backticks inside aren't mangled)
    line = line.replace(/`([^`]+)`/g, (_, code) => ANSI.cyan(code));
    // Bold + italic
    line = line.replace(/\*\*\*(.+?)\*\*\*/g, (_, t) => ANSI.bold(ANSI.italic(t)));
    // Bold
    line = line.replace(/\*\*(.+?)\*\*/g, (_, t) => ANSI.bold(t));
    // Italic
    line = line.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (_, t) => ANSI.italic(t));
    // Links [text](url) → text (url)
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `${ANSI.bold(text)} ${ANSI.gray(`(${url})`)}`);
    return line;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RepoSpec {
    include?: string[];
    exclude?: string[];
    urls?: string[];
    maxCrawlPages?: number;
    chunkSize?: number;
    chunkOverlap?: number;
    model?: string;
    topK?: number;
    systemPrompt?: string;
    tree?: TreeSpec;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Step = 'indexing' | 'chat';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_INCLUDE = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.swift',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.rb', '.php', '.lua', '.sh', '.bash', '.zsh',
    '.json', '.yaml', '.yml', '.toml',
    '.md', '.mdx', '.txt', '.rst',
    '.sql', '.graphql', '.proto',
    '.css', '.scss', '.html', '.svelte', '.vue',
];

const DEFAULT_EXCLUDE = [
    'node_modules', '.git', 'dist', 'build', 'out', '.next',
    '__pycache__', '.venv', 'venv', 'target', 'vendor',
    '.cache', '.turbo', 'coverage', '.nyc_output',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: npx tsx examples/repo-bot.tsx <repo-path> [spec.json]');
    console.error('');
    console.error('  repo-path   Path to a local repository');
    console.error('  spec.json   Optional JSON config file');
    console.error('');
    console.error('Example spec.json:');
    console.error(JSON.stringify({
        include: [".ts", ".md"],
        exclude: ["node_modules", "dist"],
        urls: ["https://example.com/docs"],
        model: "gpt-4o-mini",
        topK: 8,
        chunkSize: 800,
    }, null, 2));
    process.exit(1);
}

const repoPath = path.resolve(args[0]);
if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`Error: "${repoPath}" is not a valid directory.`);
    process.exit(1);
}

let spec: RepoSpec = {};
if (args[1]) {
    const specPath = path.resolve(args[1]);
    if (fs.existsSync(specPath)) {
        spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    } else {
        console.error(`Warning: spec file "${specPath}" not found, using defaults.`);
    }
}

const INCLUDE_EXTS = spec.include || DEFAULT_INCLUDE;
const EXCLUDE_PATTERNS = spec.exclude || DEFAULT_EXCLUDE;
const MODEL = spec.model || 'gpt-4o-mini';
const TOP_K = spec.topK || 8;
const repoName = path.basename(repoPath);
const FRESH = args.includes('--fresh');

// ─── Snapshot cache ──────────────────────────────────────────────────────────
// Persists embeddings to disk so re-runs don't re-embed everything.
// Stored in .ragnexus/ inside the target repo.

const cacheDir = path.join(repoPath, '.ragnexus');
const snapshotPath = path.join(cacheDir, 'vector-store.json');

function ensureCacheDir() {
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        // Add to .gitignore if it exists
        const gitignorePath = path.join(repoPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            if (!content.includes('.ragnexus')) {
                fs.appendFileSync(gitignorePath, '\n# RagNexus bot cache\n.ragnexus/\n');
            }
        }
    }
}

// ─── File walker ──────────────────────────────────────────────────────────────

function shouldExclude(relativePath: string): boolean {
    return relativePath.split(path.sep).some(p => EXCLUDE_PATTERNS.includes(p));
}

function walkDir(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(repoPath, fullPath);
        if (shouldExclude(rel)) continue;

        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (INCLUDE_EXTS.includes(ext)) {
                const stat = fs.statSync(fullPath);
                if (stat.size <= 100_000) results.push(fullPath);
            }
        }
    }
    return results;
}

// ─── RagNexus setup ───────────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const splitter = new TextSplitter({
    chunkSize: spec.chunkSize || 800,
    chunkOverlap: spec.chunkOverlap || 100,
});
const embedder = new OpenAIEmbedder({ model: 'text-embedding-3-small' });

// Vector store and RAG engine are created lazily in the indexing step
// so we can load from snapshot if available.
let vectorStore: InMemoryVectorStore = new InMemoryVectorStore(embedder);

// TreeStore — structured knowledge that gets prepended to vector results
const treeStore = spec.tree ? new TreeStore({ tree: spec.tree }) : undefined;
const treeNodeCount = treeStore ? treeStore.listPaths().length : 0;

let rag = createRag({
    storage: { vector: vectorStore, memory: new InMemoryStore() },
    embedder,
    guardrails: { minRelevanceScore: 0.25, maxTokens: 6144 },
    ...(treeStore ? { treeStore } : {}),
});
let adapter = new OpenAIAdapter(rag);

/** Rebuild RAG engine with a new vector store (after loading snapshot). */
function rebuildRag(store: InMemoryVectorStore) {
    vectorStore = store;
    rag = createRag({
        storage: { vector: store, memory: new InMemoryStore() },
        embedder,
        guardrails: { minRelevanceScore: 0.25, maxTokens: 6144 },
        ...(treeStore ? { treeStore } : {}),
    });
    adapter = new OpenAIAdapter(rag);
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
    return spec.systemPrompt || `You are a code assistant for the "${repoName}" repository.

RULES:
1. Answer ONLY from the retrieved context. These are real files from the repo.
2. When referencing code, include the file path.
3. If the context doesn't have the answer, say so honestly.
4. Reproduce code exactly as found in context.
5. You can explain architecture, debug issues, suggest improvements, and answer questions about the codebase.`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const App = () => {
    const [step, setStep] = useState<Step>('indexing');
    const [statusMsg, setStatusMsg] = useState('Starting up…');
    const [fileCount, setFileCount] = useState(0);
    const [pageCount, setPageCount] = useState(0);
    const [chunkCount, setChunkCount] = useState(0);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStream, setCurrentStream] = useState('');
    const [error, setError] = useState<string | null>(null);

    // ─── Indexing on mount ────────────────────────────────────────────────────

    const indexedRef = useRef(false);
    if (!indexedRef.current) {
        indexedRef.current = true;

        if (!openai) {
            setError('Missing OPENAI_API_KEY. Set it in your .env file.');
        } else {
            (async () => {
                try {
                    // Try loading from cached snapshot (skip if --fresh)
                    if (!FRESH && fs.existsSync(snapshotPath)) {
                        setStatusMsg('Loading cached embeddings…');
                        const cached = await InMemoryVectorStore.load(snapshotPath, embedder);
                        rebuildRag(cached);
                        setChunkCount((cached as any).docs?.length ?? 0);
                        setStatusMsg('Loaded from cache.');
                        setStep('chat');
                        return;
                    }

                    // 1. Walk local files
                    setStatusMsg('Scanning repository files…');
                    const files = walkDir(repoPath);
                    setFileCount(files.length);

                    const fileDocs = files.map(f => {
                        const rel = path.relative(repoPath, f);
                        const content = fs.readFileSync(f, 'utf-8');
                        return {
                            id: rel,
                            text: `// File: ${rel}\n${content}`,
                            source: rel,
                            metadata: {
                                filePath: rel,
                                extension: path.extname(f),
                                directory: path.dirname(rel),
                            },
                        };
                    });

                    // 2. Crawl URLs
                    let crawlDocs: { id: string; text: string; source?: string; metadata?: Record<string, any> }[] = [];
                    const urls = spec.urls || [];
                    if (urls.length > 0) {
                        const crawler = new WebCrawler({
                            headless: true,
                            maxRequestsPerCrawl: spec.maxCrawlPages || 5,
                        });
                        for (const url of urls) {
                            setStatusMsg(`Crawling ${url} …`);
                            try {
                                const result = await crawler.scrapeWithLinks([url]);
                                crawlDocs.push(...result.docs);
                            } catch (e: any) {
                                // non-fatal: continue with what we have
                            }
                        }
                        setPageCount(crawlDocs.length);
                    }

                    const allDocs = [...fileDocs, ...crawlDocs];
                    if (allDocs.length === 0) {
                        setError('No data found. Check your include/exclude settings and URLs.');
                        return;
                    }

                    // 3. Split + embed
                    setStatusMsg(`Splitting ${allDocs.length} documents…`);
                    const chunks = splitter.splitDocuments(allDocs);

                    setStatusMsg(`Embedding ${chunks.length} chunks…`);
                    const result = await rag.upsertDocuments(chunks);
                    setChunkCount(result.added + result.updated);

                    // 4. Save snapshot for next run
                    setStatusMsg('Saving cache…');
                    ensureCacheDir();
                    await vectorStore.save(snapshotPath);

                    setStep('chat');
                } catch (e: any) {
                    setError(e.message);
                }
            })();
        }
    }

    // ─── Chat handler ─────────────────────────────────────────────────────────

    const handleChat = useCallback(async (query: string) => {
        if (!query.trim() || isGenerating) return;
        if (query.toLowerCase() === 'exit') process.exit(0);

        const updatedHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: query }];
        setChatHistory(updatedHistory);
        setInput('');
        setIsGenerating(true);
        setCurrentStream('');

        try {
            const config = await adapter.getCompletionConfig(
                {
                    model: MODEL,
                    messages: [
                        { role: 'system', content: buildSystemPrompt() },
                        ...updatedHistory,
                    ],
                    stream: true,
                },
                { topK: TOP_K, searchMode: 'hybrid', alpha: 0.6 },
            );

            const stream = await openai!.chat.completions.create(config);

            let text = '';
            for await (const chunk of stream as any) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                    text += delta;
                    setCurrentStream(text);
                }
            }

            setChatHistory([...updatedHistory, { role: 'assistant', content: text || '(no response)' }]);
        } catch (e: any) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
        } finally {
            setIsGenerating(false);
            setCurrentStream('');
        }
    }, [chatHistory, isGenerating]);

    // ─── Render: error ────────────────────────────────────────────────────────

    if (error) return (
        <Box flexDirection="column" padding={1}>
            <Text color="red" bold>Error: {error}</Text>
            <Text color="gray">Check your .env and repository path, then restart.</Text>
        </Box>
    );

    // ─── Render: indexing ─────────────────────────────────────────────────────

    if (step === 'indexing') return (
        <Box flexDirection="column" paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
                <Text color="cyan" bold>RepoBot</Text>
                <Text color="white">{repoName}</Text>
            </Box>
            <Box marginTop={1} gap={1}>
                <Text color="cyan"><Spinner type="dots" /></Text>
                <Text>{statusMsg}</Text>
            </Box>
            {fileCount > 0 && (
                <Box marginLeft={4}>
                    <Text color="gray">{fileCount} files found</Text>
                </Box>
            )}
            {treeNodeCount > 0 && (
                <Box marginLeft={4}>
                    <Text color="gray">{treeNodeCount} tree nodes loaded</Text>
                </Box>
            )}
        </Box>
    );

    // ─── Render: chat ─────────────────────────────────────────────────────────

    const statsLine = [
        `${fileCount} files`,
        pageCount > 0 ? `${pageCount} pages` : null,
        `${chunkCount} chunks`,
        treeNodeCount > 0 ? `${treeNodeCount} tree nodes` : null,
    ].filter(Boolean).join(' · ');

    return (
        <Box flexDirection="column" paddingY={1}>
            {/* Header */}
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0}>
                <Box gap={2}>
                    <Text color="cyan" bold>RepoBot</Text>
                    <Text color="white" bold>{repoName}</Text>
                    <Text color="gray">({MODEL})</Text>
                </Box>
                <Text color="gray" dimColor>  {statsLine}</Text>
                <Text color="gray" dimColor>  {repoPath}</Text>
            </Box>

            {/* Hints */}
            <Box marginLeft={2} marginTop={1}>
                <Text color="gray" dimColor>
                    <Text color="cyan">exit</Text> to quit · <Text color="cyan">--fresh</Text> to re-index
                </Text>
            </Box>

            {/* Chat history */}
            <Box flexDirection="column" marginTop={1}>
                {chatHistory.map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1} marginLeft={1}>
                        <Box gap={1}>
                            <Text color={m.role === 'user' ? 'blue' : 'cyan'} bold>
                                {m.role === 'user' ? ' You ' : ' Bot '}
                            </Text>
                        </Box>
                        <Box marginLeft={2}>
                            {m.role === 'assistant'
                                ? <Text>{renderMd(m.content)}</Text>
                                : <Text color="white">{m.content}</Text>}
                        </Box>
                    </Box>
                ))}
            </Box>

            {/* Streaming response */}
            {isGenerating && (
                <Box flexDirection="column" marginBottom={1} marginLeft={1}>
                    <Box gap={1}>
                        <Text color="cyan" bold> Bot </Text>
                    </Box>
                    <Box marginLeft={2}>
                        {currentStream
                            ? <Text>{renderMd(currentStream)}</Text>
                            : (
                                <Box gap={1}>
                                    <Text color="yellow"><Spinner type="dots" /></Text>
                                    <Text color="gray">Thinking…</Text>
                                </Box>
                            )}
                    </Box>
                </Box>
            )}

            {/* Input */}
            {!isGenerating && (
                <Box marginTop={1} marginLeft={1} gap={1}>
                    <Text color="blue" bold> You </Text>
                    <TextInput value={input} onChange={setInput} onSubmit={handleChat}
                        placeholder="Ask anything about the codebase…" />
                </Box>
            )}
        </Box>
    );
};

render(<App />);
