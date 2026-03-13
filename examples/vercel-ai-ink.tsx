import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { useEffect, useState } from 'react';
import {
    createRag,
    InMemoryStore,
    InMemoryVectorStore,
    OllamaEmbedder,
    TextSplitter,
    VercelAIAdapter,
    WebCrawler
} from "../src";

type Message = { role: 'user' | 'assistant' | 'system', content: string };

const TARGET_URL = process.env.TARGET_URL || "https://github.com/microsoft/TypeScript";

// Setup singletons outside component
const openaiProvider = process.env.OPENAI_API_KEY ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const crawler = new WebCrawler({ headless: true, maxRequestsPerCrawl: 5 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const embedder = new OllamaEmbedder({ model: "nomic-embed-text" });
const vectorStore = new InMemoryVectorStore(embedder);
const memoryStore = new InMemoryStore();
const rag = createRag({
    storage: { vector: vectorStore, memory: memoryStore },
    embedder,
    guardrails: { minRelevanceScore: 0.5, maxTokens: 3000 }
});
const vercelAIAdapter = new VercelAIAdapter(rag);

const App = () => {
    const [step, setStep] = useState<'init' | 'scraping' | 'embedding' | 'chat'>('init');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', content: `You are a helpful programming assistant summarizing a GitHub repository: ${TARGET_URL}` }
    ]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStream, setCurrentStream] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!openaiProvider) {
            setError("❌ ERROR: Missing OPENAI_API_KEY for Vercel AI provider.");
            return;
        }

        const initRag = async () => {
            try {
                setStep('scraping');
                const docs = await crawler.scrapeBatch([TARGET_URL]);

                if (docs.length === 0 || !docs[0].text) {
                    setError("❌ Failed to extract any text from the repository.");
                    return;
                }

                setStep('embedding');
                await rag.addDocuments(splitter.splitDocuments(docs));

                setStep('chat');
            } catch (e: any) {
                setError(`Initialization Failed: ${e.message}`);
            }
        };
        initRag();
    }, []);

    const handleSubmit = async (query: string) => {
        if (!query.trim() || isGenerating) return;
        if (query.toLowerCase() === 'exit') {
            process.exit(0);
        }

        const newMessages = [...messages, { role: 'user' as const, content: query }];
        setMessages(newMessages);
        setInput('');
        setIsGenerating(true);
        setCurrentStream('');

        try {
            // VercelAIAdapter wraps the streamText call
            const result = await vercelAIAdapter.streamTextWithContext(
                streamText,
                {
                    model: openaiProvider!('gpt-4o-mini'),
                    messages: newMessages as any,
                },
                { memory: false }
            );

            let fullContent = '';
            for await (const textPart of result.textStream) {
                fullContent += textPart;
                setCurrentStream(fullContent);
            }

            setMessages([...newMessages, { role: 'assistant', content: fullContent }]);
            setIsGenerating(false);
            setCurrentStream('');
        } catch (err: any) {
            setError(`Error generating response: ${err.message}`);
            setIsGenerating(false);
        }
    };

    if (error) {
        return <Text color="red">{error}</Text>;
    }

    if (step === 'init' || step === 'scraping') {
        return (
            <Box>
                <Text color="cyan"><Spinner type="dots" /></Text>
                <Text color="blueBright"> Crawling repository: {TARGET_URL} (This may take 10-15s)...</Text>
            </Box>
        );
    }

    if (step === 'embedding') {
        return (
            <Box>
                <Text color="magenta"><Spinner type="dots" /></Text>
                <Text color="magentaBright"> Creating Ollama embeddings (ensure Ollama is running)...</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2}>
                <Text color="cyan" bold>RagNexus Terminal (Vercel AI + Ollama)</Text>
                <Text color="gray">Repository: {TARGET_URL}</Text>
            </Box>

            <Box flexDirection="column" marginTop={1}>
                {messages.filter(m => m.role !== 'system').map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'blueBright' : 'greenBright'} bold>
                            {m.role === 'user' ? 'You' : 'AI SDK'}:
                        </Text>
                        <Text>{m.content}</Text>
                    </Box>
                ))}
            </Box>

            {isGenerating && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="greenBright" bold>AI SDK:</Text>
                    {currentStream.length > 0 ? (
                        <Text>{currentStream}</Text>
                    ) : (
                        <Box>
                            <Text color="yellow"><Spinner type="dots" /></Text>
                            <Text color="gray"> Thinking...</Text>
                        </Box>
                    )}
                </Box>
            )}

            {!isGenerating && (
                <Box marginTop={1}>
                    <Text color="blueBright" bold>You: </Text>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        placeholder="Ask a question about the repo... (type 'exit' to quit)"
                    />
                </Box>
            )}
        </Box>
    );
};

render(<App />);
