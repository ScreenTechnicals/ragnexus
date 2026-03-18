// Enable color for marked-terminal's bundled chalk — must run before import
process.env.FORCE_COLOR = process.env.FORCE_COLOR || '1';

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import { marked } from 'marked';
// @ts-ignore
import TextInput from 'ink-text-input';
import { markedTerminal } from 'marked-terminal';
import { useCallback, useState } from 'react';
import {
    AnthropicAdapter,
    CohereEmbedder,
    createRag,
    InMemoryStore,
    InMemoryVectorStore,
    TextSplitter,
    WebCrawler
} from "../src";

marked.use(markedTerminal());

type Message = { role: 'user' | 'assistant' | 'system', content: string };
type Step = 'url-input' | 'scraping' | 'embedding' | 'chat';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const crawler = new WebCrawler({ headless: true, maxRequestsPerCrawl: 10 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const embedder = new CohereEmbedder({ model: 'embed-english-v3.0' });
const vectorStore = new InMemoryVectorStore(embedder);
const memoryStore = new InMemoryStore();
const rag = createRag({
    storage: { vector: vectorStore, memory: memoryStore },
    embedder,
    guardrails: { minRelevanceScore: 0.5, maxTokens: 3000 },
});
const anthropicAdapter = new AnthropicAdapter(rag);

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

    const loadUrls = useCallback(async (urls: string[]) => {
        setStep('scraping');
        setStatusMsg(`Crawling ${urls.length} URL(s)…`);
        const docs = await crawler.scrapeBatch(urls);
        if (!docs.length) throw new Error('No text extracted from the provided URL(s).');
        setStep('embedding');
        setStatusMsg(`Chunking & embedding ${docs.length} page(s)…`);
        const chunks = splitter.splitDocuments(docs);
        const result = await rag.upsertDocuments(chunks);
        setDocCount(n => n + result.added + result.updated);
        setLoadedUrls(prev => [...prev, ...urls]);
        return result;
    }, []);

    const handleUrlSubmit = useCallback(async (raw: string) => {
        if (!anthropic) { setError('❌ Missing ANTHROPIC_API_KEY.'); return; }
        const urls = parseUrls(raw);
        if (!urls.length) return;
        try {
            const result = await loadUrls(urls);
            setMessages([{ role: 'system', content: `You are a helpful assistant. Loaded ${result.added} document chunks from: ${urls.join(', ')}` }]);
            setStep('chat');
        } catch (e: any) { setError(`❌ ${e.message}`); }
    }, [loadUrls]);

    const handleChat = useCallback(async (query: string) => {
        if (!query.trim() || isGenerating) return;
        if (query.toLowerCase() === 'exit') process.exit(0);

        if (query.startsWith('/add ')) {
            const urls = parseUrls(query.slice(5));
            if (!urls.length) return;
            setInput('');
            setIsGenerating(true);
            try {
                const result = await loadUrls(urls);
                setMessages(prev => [...prev, { role: 'assistant', content: `✅ Loaded ${result.added} new chunks from ${urls.map(shortUrl).join(', ')}.` }]);
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
            const config = await anthropicAdapter.getCompletionConfig({ messages: newMessages }, { memory: false });
            const systemContent = config.messages
                .filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n\n');
            const chatMessages = config.messages
                .filter((m: any) => m.role !== 'system')
                .map((m: any) => ({ role: m.role, content: m.content }));

            const stream = await anthropic!.messages.create({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 1024,
                system: systemContent,
                messages: chatMessages,
                stream: true,
            });
            let full = '';
            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    full += chunk.delta.text;
                    setCurrentStream(full);
                }
            }
            setMessages([...newMessages, { role: 'assistant', content: full }]);
        } catch (e: any) { setError(`Error: ${e.message}`); }
        finally { setIsGenerating(false); setCurrentStream(''); }
    }, [messages, isGenerating, docCount, loadUrls]);

    if (error) return <Box padding={1}><Text color="red">{error}</Text></Box>;

    if (step === 'url-input') return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1}>
                <Text color="magenta" bold>🟣 RagNexus — Anthropic (Claude)</Text>
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
                <Text color="magenta"><Spinner type="dots" /></Text>
                <Text color="magentaBright">{statusMsg}</Text>
            </Box>
            {loadedUrls.map(u => <Text key={u} color="gray" dimColor>  ✓ {shortUrl(u)}</Text>)}
        </Box>
    );

    return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={2} paddingY={0}>
                <Box gap={2}>
                    <Text color="magenta" bold>🟣 RagNexus — Claude</Text>
                    <Text color="gray">{docCount} chunks · {loadedUrls.length} source(s)</Text>
                </Box>
                {loadedUrls.map(u => <Text key={u} color="gray" dimColor>  {shortUrl(u)}</Text>)}
            </Box>
            <Text color="gray" dimColor>  Tip: <Text color="magenta">/add &lt;url&gt;</Text> to load more · <Text color="magenta">exit</Text> to quit</Text>

            <Box flexDirection="column" marginTop={1}>
                {messages.filter(m => m.role !== 'system').map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'blueBright' : 'magentaBright'} bold>
                            {m.role === 'user' ? 'You' : 'Claude'}
                        </Text>
                        {m.role === 'assistant' ? <Text>{marked.parse(m.content) as string}</Text> : <Text>{m.content}</Text>}
                    </Box>
                ))}
            </Box>

            {isGenerating && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="magentaBright" bold>Claude</Text>
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
