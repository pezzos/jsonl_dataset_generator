const express = require('express');
const dotenv = require('dotenv');
const { Configuration, OpenAIApi } = require('openai');
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
// Stockage en mémoire pour la session (demo)
let generatedQuestions = [];
let finalFAQs = [];
// Récupération des fournisseurs selon les clés définies dans le .env
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
// Définition des catégories de questions
const categories = [
    "Questions habituelles",
    "Questions techniques",
    "Questions pour en comprendre plus",
    "Questions farfelues",
    "Questions non posées mais intéressantes"
];
// Initialize API clients
const openai = process.env.OPENAI_API_KEY ? new OpenAIApi(new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
})) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;

// Fonction pour générer le prompt pour chaque catégorie
function generatePromptForCategory(keyword, category) {
    const categoryPrompts = {
        "Questions habituelles": `Retourne moi une liste de 5 questions qui sont fréquemment posées sur le sujet "${keyword}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Questions techniques": `Retourne moi une liste de 5 questions qui sont techniques sur le sujet "${keyword}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Questions pour en comprendre plus": `Retourne moi une liste de 5 questions qui permettent d'aller plus loin sur le sujet "${keyword}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Questions farfelues": `Retourne moi une liste de 5 questions qui sont originales ou farfelues sur le sujet "${keyword}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Questions non posées mais intéressantes": `Retourne moi une liste de 5 questions qui sont rarement posées mais qui devraient l'être sur le sujet "${keyword}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`
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

// Fonction pour générer le prompt de regroupement
function generateGroupingPrompt(questions) {
    return `Analyse cette liste de questions et regroupe celles qui sont similaires ou qui traitent du même sujet.
Pour chaque groupe, choisis la question la plus complète et pertinente.
Réponds uniquement avec un tableau JSON contenant les questions regroupées, avec cette structure :
[{
    "selectedQuestion": "La question choisie",
    "similarQuestions": ["Question similaire 1", "Question similaire 2"],
    "explanation": "Brève explication du regroupement"
}]

Questions à analyser :
${questions.map(q => `"${q.question}"`).join('\n')}`;
}

// Endpoint pour générer des questions à partir des mots clés
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
// Endpoint pour smart sort (déduplication et tri intelligent)
app.post('/api/smartSort', async (req, res) => {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Veuillez fournir une liste de questions." });
    }

    try {
        // Utiliser Claude pour l'analyse (car plus puissant pour ce type de tâche)
        if (!anthropic) {
            return res.status(400).json({ error: "Service d'analyse non disponible." });
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

        // Créer un nouvel ensemble de questions en conservant les métadonnées
        const processedQuestions = [];
        const usedQuestions = new Set();

        analysis.forEach(group => {
            // Trouver la question originale correspondante
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

        // Ajouter les questions qui n'ont pas été regroupées
        questions.forEach(q => {
            if (!usedQuestions.has(q.question)) {
                processedQuestions.push(q);
            }
        });

        // Tri final par mot-clé puis par catégorie
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
            error: "Erreur lors du tri intelligent.",
            details: isDev ? error.message : undefined
        });
    }
});
// Endpoint pour générer la FAQ en combinant les réponses des différents LLM
app.post('/api/generateFAQ', (req, res) => {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "Veuillez fournir une liste de questions." });
    }
    let faqs = questions.map(q => {
        // Simulation d'appels à chaque fournisseur pour obtenir une réponse
        const providerAnswers = providers.map(provider => {
            return `Réponse de ${provider} pour "${q.question}"`;
        });
        // Combinaison des réponses (en simulant une fusion via LLM)
        const combinedAnswer = `Réponse combinée: ${providerAnswers.join(" | ")}`;
        return {
            id: q.id,
            topic: q.topic,
            question: q.question,
            answer: combinedAnswer
        };
    });
    finalFAQs = faqs; // stockage global
    res.json({ faqs });
});
// Endpoint pour exporter la FAQ en fichier JSONL
app.get('/api/exportFAQ', (req, res) => {
    if (!finalFAQs || finalFAQs.length === 0) {
        return res.status(400).json({ error: "Aucune FAQ générée à exporter." });
    }
    // Création du contenu JSONL
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
// Endpoint pour récupérer les providers disponibles
app.get('/api/providers', (req, res) => {
    devLog('Fetching available providers');
    res.json({ providers });
});

// Endpoint pour générer des déclinaisons de mots-clés
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

// Endpoint pour générer des smart tags
app.post('/api/generateSmartTags', async (req, res) => {
    const { text, existingTags } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Veuillez fournir un texte à analyser." });
    }

    try {
        if (!anthropic) {
            return res.status(400).json({ error: "Service d'analyse non disponible." });
        }

        const existingTagsPrompt = existingTags && existingTags.length > 0
            ? `\nVoici les tags existants: ${JSON.stringify(existingTags)}
Si tu vois des tags qui correspondent bien au texte, utilise-les. Sinon, tu peux en créer de nouveaux.`
            : '';

        const prompt = `Analyse ce texte et extrait-en 1 à 3 tags pertinents qui représentent les concepts clés.
RÈGLES IMPORTANTES pour les tags:
1. Toujours utiliser le singulier (exemple: "legume" et non "legumes")
2. Pour les expressions de plusieurs mots, utiliser des underscores (exemple: "base_de_donnee")
3. Pas d'espaces, pas d'accents, pas de caractères spéciaux
4. Tout en minuscules
5. Rester simple et générique
6. Préférer les tags existants

Exemple 1: "astuces pour faire manger des légumes aux tout-petits" -> ["astuce", "legume", "enfant"]
Exemple 2: "impact du régime kéto sur la santé mentale" -> ["alimentation", "keto", "sante_mentale"]
Exemple 3: "les différents types de bases de données SQL" -> ["base_de_donnee", "sql"]

Texte à analyser: "${text}"${existingTagsPrompt}

IMPORTANT: Réponds UNIQUEMENT avec un tableau JSON contenant les tags, rien d'autre.
Format attendu: ["tag1", "tag2", "tag3"]`;

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
            throw new Error('Format de réponse invalide');
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
            error: "Une erreur est survenue lors de la génération des tags.",
            details: isDev ? error.message : undefined
        });
    }
});

// Ajouter après la configuration des middlewares
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Ajouter avant app.listen()
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Ajouter une route catch-all pour gérer les autres chemins
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
