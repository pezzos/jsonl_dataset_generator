const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV === 'development';

// Configuration CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [
        `https://faq.${process.env.DOMAIN}`,
        `https://${process.env.DOMAIN}`,
        `http://faq.${process.env.DOMAIN}`,
        `http://${process.env.DOMAIN}`
      ]
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
// In-memory storage for the session (demo)
let generatedQuestions = [];
let finalFAQs = [];
// Retrieve providers based on the keys defined in the .env
let providers = [];
if (process.env.OPENAI_API_KEY) {
    providers.push("GPT-4");
    devLog('OpenAI API configured');
}
if (process.env.ANTHROPIC_API_KEY) {
    providers.push("Claude");
    devLog('Anthropic API configured');
}
if (process.env.GOOGLE_API_KEY) {
    providers.push("Google");
    devLog('Google API configured');
}
devLog('Available providers:', providers);
// Question categories definition
const categories = [
    "Common Questions",
    "Technical Questions",
    "In-Depth Questions",
    "Creative Questions",
    "Unasked but Interesting"
];
// Initialize API clients
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;

// Function to generate the prompt for each category
function generatePromptForCategory(keyword, category) {
    const categoryPrompts = {
        "Common Questions": `Return a list of 5 questions that are frequently asked about the topic "${keyword}". Reply only with the questions, one per line, without numbering or formatting.`,
        "Technical Questions": `Return a list of 5 technical questions on the topic "${keyword}". Reply only with the questions, one per line, without numbering or formatting.`,
        "In-Depth Questions": `Return a list of 5 questions that allow deeper understanding of the topic "${keyword}". Reply only with the questions, one per line, without numbering or formatting.`,
        "Creative Questions": `Return a list of 5 original or offbeat questions about the topic "${keyword}". Reply only with the questions, one per line, without numbering or formatting.`,
        "Unasked but Interesting": `Return a list of 5 questions that are rarely asked but should be about the topic "${keyword}". Reply only with the questions, one per line, without numbering or formatting.`
    };
    return categoryPrompts[category];
}

// Fonctions pour chaque provider LLM
async function askGPT4(prompt) {
    try {
        const model = modelSettings.generateQuestions.openai;
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });
        return completion.choices[0].message.content.split('\n').filter(q => q.trim());
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}

async function askClaude(prompt) {
    try {
        const model = modelSettings.generateQuestions.anthropic;
        const message = await anthropic.messages.create({
            model: model,
            max_tokens: 1500,
            messages: [{ role: "user", content: prompt }]
        });
        return message.content[0].text.split('\n').filter(q => q.trim());
    } catch (error) {
        console.error('Anthropic API error:', error);
        throw error;
    }
}

async function askGoogle(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().split('\n').filter(q => q.trim());
    } catch (error) {
        console.error('Google API error:', error);
        throw error;
    }
}

// Fonction de logging
function devLog(...args) {
    if (isDev) {
        console.log('[DEV]', ...args);
    }
}

// Function to generate the grouping prompt
function generateGroupingPrompt(questions) {
    return `Analyze this list of questions and group those that are similar or deal with the same topic.
For each group, choose the most complete and relevant question.
Reply only with a JSON array containing the grouped questions, using this structure:
[{
    "selectedQuestion": "The chosen question",
    "similarQuestions": ["Similar question 1", "Similar question 2"],
    "explanation": "Brief explanation of the grouping"
}]

Questions to analyze:
${questions.map(q => `"${q.question}"`).join('\n')}`;
}

// Endpoint to generate questions from keywords
app.post('/api/generateQuestions', async (req, res) => {
    const { topics, provider, category } = req.body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
        return res.status(400).json({ error: "Please provide a list of topics." });
    }
    if (!provider || !category) {
        return res.status(400).json({ error: "Please specify a provider and category." });
    }

    try {
        const topic = topics[0];
        const prompt = generatePromptForCategory(topic, category);
        devLog('Generated prompt:', prompt);
        let questions;

        switch (provider) {
            case "GPT-4":
                if (!openai) {
                    return res.status(400).json({ error: "OpenAI API not configured" });
                }
                questions = await askGPT4(prompt);
                break;
            case "Claude":
                if (!anthropic) {
                    return res.status(400).json({ error: "Anthropic API not configured" });
                }
                questions = await askClaude(prompt);
                break;
            case "Google":
                if (!genAI) {
                    return res.status(400).json({ error: "Google API not configured" });
                }
                questions = await askGoogle(prompt);
                break;
            default:
                return res.status(400).json({ error: "Unsupported provider" });
        }

        devLog('Generated questions:', questions);

        const result = questions.map(question => ({
            topic,
            source: provider,
            category,
            question: question.trim()
        })).filter(q => q.question);

        devLog('Formatted results:', result);
        res.json({ questions: result });
    } catch (error) {
        console.error('Error generating questions:', error);
        devLog('Error details:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        res.status(500).json({
            error: "Error generating questions.",
            details: isDev ? error.message : undefined
        });
    }
});
// Endpoint for smart sort (deduplication and intelligent sorting)
app.post('/api/smartSort', async (req, res) => {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Please provide a list of questions." });
    }

    try {
        // Use Claude for analysis (more powerful for this kind of task)
        if (!anthropic) {
            return res.status(400).json({ error: "Analysis service unavailable." });
        }

        devLog('Starting smart sort analysis');
        const prompt = generateGroupingPrompt(questions);

        const message = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 1500,
            messages: [{ role: "user", content: prompt }]
        });

        const analysis = JSON.parse(message.content[0].text);
        devLog('Received analysis:', analysis);

        // Create a new set of questions while keeping the metadata
        const processedQuestions = [];
        const usedQuestions = new Set();

        analysis.forEach(group => {
            // Find the corresponding original question
            const selectedQ = questions.find(q => q.question === group.selectedQuestion) ||
                            questions.find(q => group.similarQuestions.includes(q.question));

            if (selectedQ && !usedQuestions.has(selectedQ.question)) {
                processedQuestions.push({
                    ...selectedQ,
                    groupInfo: {
                        similarQuestions: group.similarQuestions,
                        explanation: group.explanation
                    }
                });
                usedQuestions.add(selectedQ.question);
                group.similarQuestions.forEach(q => usedQuestions.add(q));
            }
        });

        // Add the questions that were not grouped
        questions.forEach(q => {
            if (!usedQuestions.has(q.question)) {
                processedQuestions.push(q);
            }
        });

        // Final sort by keyword then by category
        processedQuestions.sort((a, b) => {
            if (a.topic !== b.topic) {
                return a.topic.localeCompare(b.topic);
            }
            return a.category.localeCompare(b.category);
        });

        devLog(`Processed ${processedQuestions.length} questions from ${questions.length} originals`);
        res.json({ questions: processedQuestions });
    } catch (error) {
        console.error('Error during smart sort:', error);
        devLog('Smart sort error details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            error: "Error during smart sort.",
            details: isDev ? error.message : undefined
        });
    }
});
// Endpoint to generate the FAQ by combining responses from different LLMs
app.post('/api/generateFAQ', (req, res) => {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "Please provide a list of questions." });
    }
    let faqs = questions.map(q => {
        // Simulate calls to each provider to get an answer
        const providerAnswers = providers.map(provider => {
            return `Answer from ${provider} for "${q.question}"`;
        });
        // Combine the answers (simulating a merge via LLM)
        const combinedAnswer = `Combined answer: ${providerAnswers.join(" | ")}`;
        return {
            id: q.id,
            topic: q.topic,
            question: q.question,
            answer: combinedAnswer
        };
    });
    finalFAQs = faqs; // global storage
    res.json({ faqs });
});
// Endpoint to export the FAQ as a JSONL file
app.get('/api/exportFAQ', (req, res) => {
    if (!finalFAQs || finalFAQs.length === 0) {
        return res.status(400).json({ error: "No FAQ generated to export." });
    }
    // Create the JSONL content
    const jsonlContent = finalFAQs.map(faq => {
        return JSON.stringify({
            prompt: faq.question,
            completion: faq.answer
        });
    }).join("\n");
    res.setHeader('Content-disposition', 'attachment; filename=faq.jsonl');
    res.setHeader('Content-Type', 'text/plain');
    res.send(jsonlContent);
});
// Endpoint to retrieve available providers
app.get('/api/providers', (req, res) => {
    devLog('Fetching available providers');
    res.json({ providers });
});

// Endpoint to generate keyword variations
app.post('/api/generateTopicVariations', async (req, res) => {
    const { topic } = req.body;

    if (!topic) {
        return res.status(400).json({ error: "Please provide a topic." });
    }

    try {
        if (!anthropic) {
            return res.status(400).json({ error: "Generation service not available." });
        }

        const prompt = `You are an expert in content generation and SEO.
I'll give you a topic and you need to generate 3 to 5 relevant variations or related topics.
These variations should be related subjects or specific aspects of the main topic.

Topic: "${topic}"

Specific instructions:
1. Variations should be in English
2. Each variation must be relevant and add value
3. Avoid repetitions and too similar variations
4. Variations should be natural and commonly searched
5. Keep a consistent format (no random capitals, consistent punctuation)

IMPORTANT: Reply ONLY with a JSON array containing the variations, nothing else.
Expected format: ["variation1", "variation2", "variation3"]`;

        devLog('Generating variations for topic:', topic);

        const message = await anthropic.messages.create({
            model: "claude-3.5-sonnet",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });

        let variations;
        try {
            variations = JSON.parse(message.content[0].text.trim());

            if (!Array.isArray(variations)) {
                throw new Error('Response is not an array');
            }

            variations = variations
                .filter(v => typeof v === 'string' && v.trim().length > 0)
                .map(v => v.trim())
                .filter((v, i, arr) => arr.indexOf(v) === i);

            if (variations.length === 0) {
                throw new Error('No valid variations generated');
            }

        } catch (parseError) {
            devLog('Parse error:', parseError);
            devLog('Raw response:', message.content[0].text);
            throw new Error('Invalid response format');
        }

        devLog('Generated variations:', variations);
        res.json({ variations });

    } catch (error) {
        console.error('Error generating topic variations:', error);
        devLog('Error details:', {
            message: error.message,
            stack: error.stack
        });

        const errorMessage = error.message === 'Invalid response format'
            ? "Error generating variations. Please try again."
            : "An error occurred. Please try again later.";

        res.status(500).json({
            error: errorMessage,
            details: isDev ? error.message : undefined
        });
    }
});

// Endpoint to generate smart tags
app.post('/api/generateSmartTags', async (req, res) => {
    const { text, existingTags } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Please provide text to analyze." });
    }

    try {
        if (!anthropic) {
            return res.status(400).json({ error: "Analysis service unavailable." });
        }

        const existingTagsPrompt = existingTags && existingTags.length > 0
            ? `\nHere are the existing tags: ${JSON.stringify(existingTags)}
If you see tags that match the text well, use them. Otherwise, you can create new ones.`
            : '';

        const prompt = `Analyze this text and extract 1 to 3 relevant tags that represent the key concepts.
IMPORTANT RULES for tags:
1. Always use the singular form (example: "legume" not "legumes")
2. For multi-word expressions, use underscores (example: "base_de_donnee")
3. No spaces, no accents, no special characters
4. All lowercase
5. Keep it simple and generic
6. Prefer existing tags

Example 1: "tips for getting toddlers to eat vegetables" -> ["astuce", "legume", "enfant"]
Example 2: "impact of the keto diet on mental health" -> ["alimentation", "keto", "sante_mentale"]
Example 3: "the different types of SQL databases" -> ["base_de_donnee", "sql"]

Text to analyze: "${text}"${existingTagsPrompt}

IMPORTANT: Reply ONLY with a JSON array containing the tags, nothing else.
Expected format: ["tag1", "tag2", "tag3"]`;

        devLog('Generating smart tags for:', text);
        if (existingTags) {
            devLog('Existing tags:', existingTags);
        }

        const message = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 150,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
        });

        let tags;
        try {
            tags = JSON.parse(message.content[0].text.trim());

            if (!Array.isArray(tags)) {
                throw new Error('Response is not an array');
            }

            tags = tags
                .filter(t => typeof t === 'string' && t.trim().length > 0)
                .map(t => t.trim())
                .filter((t, i, arr) => arr.indexOf(t) === i);

        } catch (parseError) {
            devLog('Parse error:', parseError);
            devLog('Raw response:', message.content[0].text);
            throw new Error('Invalid response format');
        }

        devLog('Generated tags:', tags);
        res.json({ tags });

    } catch (error) {
        console.error('Error generating smart tags:', error);
        devLog('Error details:', {
            message: error.message,
            stack: error.stack
        });

        res.status(500).json({
            error: "An error occurred while generating tags.",
            details: isDev ? error.message : undefined
        });
    }
});

// Add after middleware configuration
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Add before app.listen()
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Add a catch-all route to handle other paths
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`FAQ Generator app listening at http://localhost:${port}`);
        devLog('Server started in development mode');
        devLog('Environment:', {
            NODE_ENV: process.env.NODE_ENV,
            providers,
            categories
        });
    });
}

module.exports = app;
