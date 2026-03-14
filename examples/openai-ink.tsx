import 'dotenv/config';
import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { marked } from 'marked';
// @ts-ignore
import TerminalRenderer from 'marked-terminal';
import OpenAI from 'openai';
import { useCallback, useState } from 'react';
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

type Message = { role: 'user' | 'assistant' | 'system' | 'tool', content: string, tool_call_id?: string };
type Step = 'url-input' | 'scraping' | 'embedding' | 'chat';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const crawler = new WebCrawler({ headless: true, maxRequestsPerCrawl: 5 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const embedder = new OpenAIEmbedder({ model: 'text-embedding-3-small' });
const vectorStore = new InMemoryVectorStore(embedder);
const memoryStore = new InMemoryStore();
const rag = createRag({
    storage: { vector: vectorStore, memory: memoryStore },
    embedder,
    guardrails: { minRelevanceScore: 0.3, maxTokens: 4096 },
});
const openaiAdapter = new OpenAIAdapter(rag);

// ─── State shared between renders ─────────────────────────────────────────────
/** All links discovered from crawled pages — the model picks from these. */
let discoveredLinks: string[] = [];
/** URLs already crawled — to avoid re-crawling. */
const crawledUrls = new Set<string>();

// ─── Tool definition for OpenAI function calling ─────────────────────────────
const CRAWL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: "function",
    function: {
        name: "crawl_page",
        description:
            "Crawl a specific URL to fetch its content. Use this when the user asks about something that is NOT in the retrieved context. Pick the most relevant URL from the available links.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The full URL to crawl and add to the knowledge base.",
                },
                reason: {
                    type: "string",
                    description: "Brief reason why this page needs to be crawled.",
                },
            },
            required: ["url"],
        },
    },
};

async function crawlAndEmbed(url: string): Promise<number> {
    if (crawledUrls.has(url)) return 0;

    const result = await crawler.scrapeWithLinks([url]);
    crawledUrls.add(url);

    // Add any newly discovered links
    for (const link of result.links) {
        if (!discoveredLinks.includes(link)) {
            discoveredLinks.push(link);
        }
    }

    if (!result.docs.length) return 0;
    const chunks = splitter.splitDocuments(result.docs);
    const upsertResult = await rag.upsertDocuments(chunks);
    return upsertResult.added + upsertResult.updated;
}

function parseUrls(raw: string): string[] {
    return raw.trim().split(/\s+/).filter(Boolean).map(u =>
        u.startsWith('http') ? u : `https://${u}`
    );
}
function shortUrl(url: string): string {
    try {
        const u = new URL(url);
        const path = u.pathname.length > 40 ? u.pathname.slice(0, 38) + '…' : u.pathname;
        return u.hostname + path;
    } catch { return url.slice(0, 60); }
}

const App = () => {
    const [step, setStep] = useState<Step>('url-input');
    const [urlInput, setUrlInput] = useState('');
    const [loadedUrls, setLoadedUrls] = useState<string[]>([]);
    const [docCount, setDocCount] = useState(0);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStream, setCurrentStream] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState('');

    const handleUrlSubmit = useCallback(async (raw: string) => {
        if (!openai) { setError('❌ Missing OPENAI_API_KEY.'); return; }
        const urls = parseUrls(raw);
        if (!urls.length) return;
        try {
            setStep('scraping');
            setStatusMsg(`Crawling ${urls.length} URL(s)…`);

            // Crawl seed page AND collect all links from it
            const result = await crawler.scrapeWithLinks(urls);
            for (const u of urls) crawledUrls.add(u);
            discoveredLinks = result.links;

            if (!result.docs.length) throw new Error('No text extracted.');

            setStep('embedding');
            setStatusMsg(`Embedding ${result.docs.length} page(s)…`);
            const chunks = splitter.splitDocuments(result.docs);
            const upsertResult = await rag.upsertDocuments(chunks);
            setDocCount(upsertResult.added + upsertResult.updated);
            setLoadedUrls(urls);

            // System prompt: grounded + tells model about crawl_page tool
            const linksPreview = discoveredLinks.slice(0, 30).map(l => `  - ${l}`).join('\n');
            setMessages([{
                role: 'system',
                content: `You are a helpful assistant that answers questions based ONLY on crawled web content.

RULES:
- Answer ONLY from the retrieved context documents. NEVER fabricate or guess content.
- If the answer is NOT in the retrieved context, use the crawl_page tool to fetch the relevant page first.
- After crawling, answer from the newly retrieved data.

Available pages you can crawl (discovered links from the seed page):
${linksPreview}${discoveredLinks.length > 30 ? `\n  ... and ${discoveredLinks.length - 30} more` : ''}

Loaded ${upsertResult.added} initial chunks from: ${urls.join(', ')}`
            }]);

            setStep('chat');
        } catch (e: any) { setError(`❌ ${e.message}`); }
    }, []);

    const handleChat = useCallback(async (query: string) => {
        if (!query.trim() || isGenerating) return;
        if (query.toLowerCase() === 'exit') process.exit(0);

        if (query.startsWith('/add ')) {
            const urls = parseUrls(query.slice(5));
            if (!urls.length) return;
            setInput('');
            setIsGenerating(true);
            setStatusMsg('Crawling…');
            try {
                const added = await crawlAndEmbed(urls[0]);
                setDocCount(n => n + added);
                setMessages(prev => [...prev, { role: 'assistant', content: `✅ Loaded ${added} new chunks from ${shortUrl(urls[0])}.` }]);
            } catch (e: any) {
                setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${e.message}` }]);
            }
            setStep('chat');
            setIsGenerating(false);
            return;
        }

        const newMessages: Message[] = [...messages, { role: 'user', content: query }];
        setMessages(newMessages);
        setInput('');
        setIsGenerating(true);
        setCurrentStream('');

        try {
            // Build RAG context
            const payload = await openaiAdapter.getCompletionConfig(
                { model: 'gpt-4o-mini', messages: newMessages, stream: true, tools: [CRAWL_TOOL] },
                { memory: false }
            );

            let currentMessages = payload.messages;
            let finalContent = '';

            // Agentic loop: keep going while the model wants to call tools
            while (true) {
                const stream = await openai!.chat.completions.create({
                    ...payload,
                    messages: currentMessages,
                    stream: true,
                } as any) as any;

                let full = '';
                let toolCalls: any[] = [];

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;

                    // Accumulate text content
                    if (delta?.content) {
                        full += delta.content;
                        setCurrentStream(full);
                    }

                    // Accumulate tool calls
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (tc.index !== undefined) {
                                if (!toolCalls[tc.index]) {
                                    toolCalls[tc.index] = { id: tc.id || '', function: { name: '', arguments: '' } };
                                }
                                if (tc.id) toolCalls[tc.index].id = tc.id;
                                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }

                // If no tool calls, we're done
                if (!toolCalls.length) {
                    finalContent = full;
                    break;
                }

                // Process tool calls
                const assistantMsg: any = { role: 'assistant', content: full || null, tool_calls: toolCalls };
                currentMessages = [...currentMessages, assistantMsg];

                for (const tc of toolCalls) {
                    if (tc.function.name === 'crawl_page') {
                        let args: any;
                        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
                        const url = args.url;

                        setCurrentStream(`🔍 Crawling ${shortUrl(url)}…`);

                        let toolResult: string;
                        try {
                            const added = await crawlAndEmbed(url);
                            setDocCount(n => n + added);
                            toolResult = `Successfully crawled ${url}. Added ${added} new chunks to the knowledge base. Now re-query the retrieved context to answer the user's question.`;
                        } catch (e: any) {
                            toolResult = `Failed to crawl ${url}: ${e.message}`;
                        }

                        currentMessages.push({
                            role: 'tool' as any,
                            tool_call_id: tc.id,
                            content: toolResult,
                        });
                    }
                }

                // After processing tools, rebuild RAG context with new data
                const refreshedPayload = await openaiAdapter.getCompletionConfig(
                    { model: 'gpt-4o-mini', messages: currentMessages, stream: true, tools: [CRAWL_TOOL] },
                    { memory: false }
                );
                currentMessages = refreshedPayload.messages;
                setCurrentStream('');
            }

            setMessages([...newMessages, { role: 'assistant', content: finalContent }]);
        } catch (e: any) { setError(`Error: ${e.message}`); }
        finally { setIsGenerating(false); setCurrentStream(''); }
    }, [messages, isGenerating, docCount]);

    if (error) return <Box padding={1}><Text color="red">{error}</Text></Box>;

    if (step === 'url-input') return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
                <Text color="green" bold>🤖 RagNexus — OpenAI</Text>
                <Text color="gray">Paste one or more URLs separated by spaces, then press Enter.</Text>
                <Text color="gray" dimColor>Supports: GitHub, docs, blog posts, any public page</Text>
            </Box>
            <Box marginTop={1} gap={1}>
                <Text color="blueBright" bold>URL(s)›</Text>
                <TextInput value={urlInput} onChange={setUrlInput} onSubmit={handleUrlSubmit}
                    placeholder="https://github.com/owner/repo  https://another-url.com" />
            </Box>
        </Box>
    );

    if (step === 'scraping' || step === 'embedding') return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box gap={1}>
                <Text color="green"><Spinner type="dots" /></Text>
                <Text color="greenBright">{statusMsg}</Text>
            </Box>
            {loadedUrls.map(u => <Text key={u} color="gray" dimColor>  ✓ {shortUrl(u)}</Text>)}
        </Box>
    );

    return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0}>
                <Box gap={2}>
                    <Text color="green" bold>🤖 RagNexus — OpenAI</Text>
                    <Text color="gray">{docCount} chunks · {discoveredLinks.length} discoverable links</Text>
                </Box>
                {loadedUrls.map(u => <Text key={u} color="gray" dimColor>  {shortUrl(u)}</Text>)}
            </Box>
            <Text color="gray" dimColor>  Tip: <Text color="green">/add &lt;url&gt;</Text> to load more · <Text color="green">exit</Text> to quit</Text>

            <Box flexDirection="column" marginTop={1}>
                {messages.filter(m => m.role !== 'system').map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'blueBright' : 'greenBright'} bold>
                            {m.role === 'user' ? 'You' : 'GPT'}
                        </Text>
                        {m.role === 'assistant' ? <Text>{marked.parse(m.content) as string}</Text> : <Text>{m.content}</Text>}
                    </Box>
                ))}
            </Box>

            {isGenerating && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="greenBright" bold>GPT</Text>
                    {currentStream ? <Text>{marked.parse(currentStream) as string}</Text> : (
                        <Box gap={1}><Text color="yellow"><Spinner type="dots" /></Text><Text color="gray">Thinking…</Text></Box>
                    )}
                </Box>
            )}

            {!isGenerating && (
                <Box marginTop={1} gap={1}>
                    <Text color="blueBright" bold>You›</Text>
                    <TextInput value={input} onChange={setInput} onSubmit={handleChat}
                        placeholder="Ask anything… or /add <url>" />
                </Box>
            )}
        </Box>
    );
};

render(<App />);
