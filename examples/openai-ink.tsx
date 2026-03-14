import 'dotenv/config';
import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { marked } from 'marked';
// @ts-ignore
import TerminalRenderer from 'marked-terminal';
import OpenAI from 'openai';
import { useCallback, useRef, useState } from 'react';
import {
    createRag,
    InMemoryStore,
    InMemoryVectorStore,
    OpenAIAdapter,
    OpenAIEmbedder,
    TextSplitter,
    WebCrawler
} from "../src";

marked.setOptions({ renderer: new TerminalRenderer() as any });

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = { role: 'user' | 'assistant', content: string };
type Step = 'url-input' | 'loading' | 'chat';

// ─── RagNexus setup ───────────────────────────────────────────────────────────

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const crawler = new WebCrawler({ headless: true, maxRequestsPerCrawl: 5 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const embedder = new OpenAIEmbedder({ model: 'text-embedding-3-small' });
const vectorStore = new InMemoryVectorStore(embedder);
const rag = createRag({
    storage: { vector: vectorStore, memory: new InMemoryStore() },
    embedder,
    guardrails: { minRelevanceScore: 0.3, maxTokens: 4096 },
});
const adapter = new OpenAIAdapter(rag);

// ─── Shared crawl state ───────────────────────────────────────────────────────

let discoveredLinks: string[] = [];
const crawledUrls = new Set<string>();

async function crawlAndEmbed(url: string): Promise<number> {
    if (crawledUrls.has(url)) return 0;
    const result = await crawler.scrapeWithLinks([url]);
    crawledUrls.add(url);
    for (const link of result.links) {
        if (!discoveredLinks.includes(link)) discoveredLinks.push(link);
    }
    if (!result.docs.length) return 0;
    const chunks = splitter.splitDocuments(result.docs);
    const r = await rag.upsertDocuments(chunks);
    return r.added + r.updated;
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const CRAWL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: "function",
    function: {
        name: "crawl_page",
        description: "Crawl a URL to fetch its content when the retrieved context does not contain the answer. Pick the most relevant URL from the available links listed in the system prompt.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The full URL to crawl." },
                reason: { type: "string", description: "Why this page is needed." },
            },
            required: ["url"],
        },
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseUrls(raw: string): string[] {
    return raw.trim().split(/\s+/).filter(Boolean).map(u => u.startsWith('http') ? u : `https://${u}`);
}
function shortUrl(url: string): string {
    try {
        const u = new URL(url);
        const path = u.pathname.length > 40 ? u.pathname.slice(0, 38) + '…' : u.pathname;
        return u.hostname + path;
    } catch { return url.slice(0, 60); }
}

/**
 * Collect streamed tool_calls from OpenAI deltas into complete objects.
 */
function accumulateToolCall(toolCalls: any[], delta: any) {
    for (const tc of delta.tool_calls) {
        if (tc.index === undefined) continue;
        if (!toolCalls[tc.index]) {
            toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
        }
        const target = toolCalls[tc.index];
        if (tc.id) target.id = tc.id;
        if (tc.function?.name) target.function.name += tc.function.name;
        if (tc.function?.arguments) target.function.arguments += tc.function.arguments;
    }
}

/**
 * Build the system prompt with the current state of discovered links.
 */
function buildSystemPrompt(seedUrls: string[]): string {
    const linksPreview = discoveredLinks.slice(0, 50).map(l => `  - ${l}`).join('\n');
    return `You are a helpful assistant that answers questions based ONLY on crawled web content.

RULES:
1. Answer ONLY from the retrieved context documents provided below. NEVER fabricate or guess content.
2. If the answer is NOT in the retrieved context, use the crawl_page tool to fetch the relevant page first, then answer from the new data.
3. When showing code or file contents, reproduce them exactly as found in the retrieved context.

Sources loaded from: ${seedUrls.join(', ')}

Available pages you can crawl with the crawl_page tool:
${linksPreview}${discoveredLinks.length > 50 ? `\n  ... and ${discoveredLinks.length - 50} more` : ''}`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const App = () => {
    const [step, setStep] = useState<Step>('url-input');
    const [urlInput, setUrlInput] = useState('');
    const [loadedUrls, setLoadedUrls] = useState<string[]>([]);
    const [docCount, setDocCount] = useState(0);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStream, setCurrentStream] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState('');

    // Ref to always access latest docCount in callbacks
    const docCountRef = useRef(docCount);
    docCountRef.current = docCount;

    // ─── URL submit handler ──────────────────────────────────────────────────

    const handleUrlSubmit = useCallback(async (raw: string) => {
        if (!openai) { setError('Missing OPENAI_API_KEY in .env'); return; }
        const urls = parseUrls(raw);
        if (!urls.length) return;

        try {
            setStep('loading');
            setStatusMsg(`Crawling ${urls.length} URL(s)…`);

            const result = await crawler.scrapeWithLinks(urls);
            for (const u of urls) crawledUrls.add(u);
            discoveredLinks = result.links;

            if (!result.docs.length) throw new Error('No text extracted from the provided URL(s).');

            setStatusMsg(`Embedding ${result.docs.length} page(s)…`);
            const chunks = splitter.splitDocuments(result.docs);
            const r = await rag.upsertDocuments(chunks);
            const total = r.added + r.updated;
            setDocCount(total);
            setLoadedUrls(urls);
            setChatHistory([]);
            setStep('chat');
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    // ─── Chat handler with agentic tool loop ─────────────────────────────────

    const handleChat = useCallback(async (query: string) => {
        if (!query.trim() || isGenerating) return;
        if (query.toLowerCase() === 'exit') process.exit(0);

        // /add command
        if (query.startsWith('/add ')) {
            const urls = parseUrls(query.slice(5));
            if (!urls.length) return;
            setInput('');
            setIsGenerating(true);
            setCurrentStream(`Crawling ${shortUrl(urls[0])}…`);
            try {
                const added = await crawlAndEmbed(urls[0]);
                setDocCount(n => n + added);
                setChatHistory(prev => [...prev, { role: 'assistant', content: `Loaded ${added} new chunks from ${shortUrl(urls[0])}.` }]);
            } catch (e: any) {
                setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
            }
            setIsGenerating(false);
            setCurrentStream('');
            return;
        }

        // Normal chat message
        const updatedHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: query }];
        setChatHistory(updatedHistory);
        setInput('');
        setIsGenerating(true);
        setCurrentStream('');

        try {
            const answer = await agenticQuery(updatedHistory, (text) => setCurrentStream(text));
            setChatHistory([...updatedHistory, { role: 'assistant', content: answer }]);
        } catch (e: any) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
        } finally {
            setIsGenerating(false);
            setCurrentStream('');
        }
    }, [chatHistory, isGenerating]);

    /**
     * Core agentic loop:
     *  1. Build clean RAG messages from conversation history
     *  2. Send to OpenAI with crawl_page tool
     *  3. If model responds with text → done
     *  4. If model calls crawl_page → crawl, embed, loop back to step 1
     */
    async function agenticQuery(
        history: ChatMessage[],
        onStream: (text: string) => void,
        maxToolRounds = 3,
    ): Promise<string> {
        // Extra messages from tool calls within this turn (not persisted to chat history)
        let toolChain: any[] = [];

        for (let round = 0; round <= maxToolRounds; round++) {
            // Step 1: Build fresh RAG context from conversation history
            const systemPrompt = buildSystemPrompt(loadedUrls);
            const ragMessages = await rag.buildContext({
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history,
                ],
            });

            // Append any tool call chain from previous rounds
            const apiMessages = [...ragMessages, ...toolChain];

            // Step 2: Stream response from OpenAI
            const stream = await openai!.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: apiMessages as any,
                stream: true,
                tools: [CRAWL_TOOL],
            });

            let text = '';
            let toolCalls: any[] = [];

            for await (const chunk of stream as any) {
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    text += delta.content;
                    onStream(text);
                }
                if (delta?.tool_calls) {
                    accumulateToolCall(toolCalls, delta);
                }
            }

            // Step 3: No tool calls → return the text answer
            if (!toolCalls.length) {
                return text || '(No response)';
            }

            // Step 4: Process tool calls, then loop
            // Add assistant message with tool_calls to the chain
            toolChain.push({ role: 'assistant', content: text || null, tool_calls: toolCalls });

            for (const tc of toolCalls) {
                if (tc.function.name === 'crawl_page') {
                    let args: any;
                    try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
                    const url = args.url || '';

                    onStream(`🔍 Crawling ${shortUrl(url)}…`);

                    let toolResult: string;
                    try {
                        const added = await crawlAndEmbed(url);
                        setDocCount(n => n + added);
                        toolResult = `Crawled ${url} successfully. ${added} new chunks added. The retrieved context in the next round will contain the new data.`;
                    } catch (e: any) {
                        toolResult = `Failed to crawl ${url}: ${e.message}`;
                    }

                    toolChain.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
                }
            }

            onStream('');
        }

        return 'I tried multiple rounds of crawling but could not find the answer. Try /add <specific-url> to load the page directly.';
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    if (error) return (
        <Box flexDirection="column" padding={1}>
            <Text color="red" bold>Error: {error}</Text>
            <Text color="gray">Check your .env file and network connection, then restart.</Text>
        </Box>
    );

    if (step === 'url-input') return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
                <Text color="green" bold>🤖 RagNexus — OpenAI Chat</Text>
                <Text color="gray">Paste one or more URLs, then press Enter.</Text>
                <Text color="gray" dimColor>The page will be crawled and you can ask questions about its content.</Text>
            </Box>
            <Box marginTop={1} gap={1}>
                <Text color="blueBright" bold>URL(s)›</Text>
                <TextInput value={urlInput} onChange={setUrlInput} onSubmit={handleUrlSubmit}
                    placeholder="https://github.com/owner/repo" />
            </Box>
        </Box>
    );

    if (step === 'loading') return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box gap={1}>
                <Text color="green"><Spinner type="dots" /></Text>
                <Text color="greenBright">{statusMsg}</Text>
            </Box>
        </Box>
    );

    return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0}>
                <Box gap={2}>
                    <Text color="green" bold>🤖 RagNexus — OpenAI Chat</Text>
                    <Text color="gray">{docCount} chunks · {discoveredLinks.length} links discovered</Text>
                </Box>
                {loadedUrls.map(u => <Text key={u} color="gray" dimColor>  {shortUrl(u)}</Text>)}
            </Box>
            <Text color="gray" dimColor>  <Text color="green">/add &lt;url&gt;</Text> to load more · <Text color="green">exit</Text> to quit · asks auto-crawl when needed</Text>

            <Box flexDirection="column" marginTop={1}>
                {chatHistory.map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'blueBright' : 'greenBright'} bold>
                            {m.role === 'user' ? 'You' : 'GPT'}
                        </Text>
                        {m.role === 'assistant'
                            ? <Text>{marked.parse(m.content) as string}</Text>
                            : <Text>{m.content}</Text>}
                    </Box>
                ))}
            </Box>

            {isGenerating && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="greenBright" bold>GPT</Text>
                    {currentStream
                        ? <Text>{marked.parse(currentStream) as string}</Text>
                        : <Box gap={1}><Text color="yellow"><Spinner type="dots" /></Text><Text color="gray">Thinking…</Text></Box>}
                </Box>
            )}

            {!isGenerating && (
                <Box marginTop={1} gap={1}>
                    <Text color="blueBright" bold>You›</Text>
                    <TextInput value={input} onChange={setInput} onSubmit={handleChat}
                        placeholder="Ask anything about the crawled content…" />
                </Box>
            )}
        </Box>
    );
};

render(<App />);
