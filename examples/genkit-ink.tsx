import { gemini, googleAI } from '@genkit-ai/googleai';
import 'dotenv/config';
import { genkit } from 'genkit';
import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { useEffect, useState } from 'react';
import {
    createRag,
    GeminiEmbedder,
    GenkitAdapter,
    InMemoryStore,
    InMemoryVectorStore,
    TextSplitter,
    WebCrawler
} from "../src";

type Message = { role: 'user' | 'assistant' | 'system', content: string };

const TARGET_URL = process.env.TARGET_URL || "https://github.com/microsoft/TypeScript";

// Setup singletons outside component
const ai = process.env.GEMINI_API_KEY ? genkit({
    plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
}) : null;

const crawler = new WebCrawler({ headless: true, maxRequestsPerCrawl: 5 });
const splitter = new TextSplitter({ chunkSize: 800, chunkOverlap: 100 });
const embedder = new GeminiEmbedder({ model: "text-embedding-004" });
const vectorStore = new InMemoryVectorStore(embedder);
const memoryStore = new InMemoryStore();
const rag = createRag({
    storage: { vector: vectorStore, memory: memoryStore },
    embedder,
    guardrails: { minRelevanceScore: 0.5, maxTokens: 3000 }
});
const genkitAdapter = new GenkitAdapter(rag);

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
        if (!ai) {
            setError("❌ ERROR: Missing GEMINI_API_KEY in environment variables.");
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
            // Get Genkit-specific payload using the GenkitAdapter
            const genkitConfig = await genkitAdapter.getGenerateOptions(
                {
                    model: gemini('gemini-2.0-flash'),
                    messages: newMessages.map(m => ({
                        role: m.role,
                        content: [{ text: m.content }]
                    })),
                },
                { memory: false }
            );

            // Execute using the official Genkit SDK
            const responseStream = await ai!.generateStream(genkitConfig);

            let fullContent = '';
            for await (const chunk of responseStream.stream) {
                fullContent += chunk.text;
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
                <Text color="magentaBright"> Creating Gemini embeddings...</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" gap={1} paddingY={1}>
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2}>
                <Text color="cyan" bold>RagNexus Terminal (Google Genkit + Gemini)</Text>
                <Text color="gray">Repository: {TARGET_URL}</Text>
            </Box>

            <Box flexDirection="column" marginTop={1}>
                {messages.filter(m => m.role !== 'system').map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'blueBright' : 'greenBright'} bold>
                            {m.role === 'user' ? 'You' : 'Genkit'}:
                        </Text>
                        <Text>{m.content}</Text>
                    </Box>
                ))}
            </Box>

            {isGenerating && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="greenBright" bold>Genkit:</Text>
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
