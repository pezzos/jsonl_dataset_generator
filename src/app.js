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
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
        });
        return response.data.choices[0].message.content.split('\n').filter(q => q.trim());
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}

async function askClaude(prompt) {
    try {
        const message = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 1000,
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
    const { keywords, provider, category } = req.body;
    devLog('Received request for questions:', { keywords, provider, category });

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        devLog('Invalid keywords:', keywords);
        return res.status(400).json({ error: "Veuillez fournir une liste de mots clés." });
    }
    if (!provider || !category) {
        devLog('Missing provider or category:', { provider, category });
        return res.status(400).json({ error: "Veuillez spécifier un provider et une catégorie." });
    }

    try {
        const keyword = keywords[0];
        const prompt = generatePromptForCategory(keyword, category);
        devLog('Generated prompt:', prompt);
        let questions;

        switch (provider) {
            case "GPT-4":
                if (!openai) {
                    devLog('OpenAI API not configured');
                    return res.status(400).json({ error: "OpenAI API non configurée" });
                }
                questions = await askGPT4(prompt);
                break;
            case "Claude":
                if (!anthropic) {
                    devLog('Anthropic API not configured');
                    return res.status(400).json({ error: "Anthropic API non configurée" });
                }
                questions = await askClaude(prompt);
                break;
            case "Google":
                if (!genAI) {
                    devLog('Google API not configured');
                    return res.status(400).json({ error: "Google API non configurée" });
                }
                questions = await askGoogle(prompt);
                break;
            default:
                devLog('Unsupported provider:', provider);
                return res.status(400).json({ error: "Provider non supporté" });
        }

        devLog('Generated questions:', questions);

        const result = questions.map(question => ({
            keyword,
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
            error: "Erreur lors de la génération des questions.",
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
            if (a.keyword !== b.keyword) {
                return a.keyword.localeCompare(b.keyword);
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
            keyword: q.keyword,
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
app.post('/api/generateKeywordVariations', async (req, res) => {
    const { keyword } = req.body;

    if (!keyword) {
        return res.status(400).json({ error: "Veuillez fournir un mot-clé." });
    }

    try {
        if (!anthropic) {
            return res.status(400).json({ error: "Service de génération non disponible." });
        }

        const prompt = `Tu es un expert en génération de contenu et en SEO.
Je te donne un mot-clé et tu dois générer 3 à 5 variations ou déclinaisons pertinentes de ce mot-clé.
Ces variations doivent être des sujets connexes ou des aspects spécifiques liés au mot-clé principal.

Mot-clé: "${keyword}"

Instructions spécifiques:
1. Les variations doivent être en français
2. Chaque variation doit être pertinente et apporter une valeur ajoutée
3. Évite les répétitions et les variations trop similaires
4. Les variations doivent être naturelles et couramment recherchées
5. Garde un format cohérent (pas de majuscules aléatoires, ponctuation cohérente)

IMPORTANT: Réponds UNIQUEMENT avec un tableau JSON contenant les variations, rien d'autre.
Format attendu: ["variation1", "variation2", "variation3"]`;

        devLog('Generating variations for keyword:', keyword);

        const message = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });

        let variations;
        try {
            // Tentative de parse du JSON
            variations = JSON.parse(message.content[0].text.trim());

            // Validation du format
            if (!Array.isArray(variations)) {
                throw new Error('Response is not an array');
            }

            // Nettoyage et validation des variations
            variations = variations
                .filter(v => typeof v === 'string' && v.trim().length > 0)
                .map(v => v.trim())
                .filter((v, i, arr) => arr.indexOf(v) === i); // Supprime les doublons

            if (variations.length === 0) {
                throw new Error('No valid variations generated');
            }

        } catch (parseError) {
            devLog('Parse error:', parseError);
            devLog('Raw response:', message.content[0].text);
            throw new Error('Format de réponse invalide');
        }

        devLog('Generated variations:', variations);
        res.json({ variations });

    } catch (error) {
        console.error('Error generating keyword variations:', error);
        devLog('Error details:', {
            message: error.message,
            stack: error.stack
        });

        // Message d'erreur plus descriptif pour l'utilisateur
        const errorMessage = error.message === 'Format de réponse invalide'
            ? "Erreur lors de la génération des variations. Veuillez réessayer."
            : "Une erreur est survenue. Veuillez réessayer plus tard.";

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

app.listen(port, () => {
    console.log(`FAQ Generator app listening at http://localhost:${port}`);
    devLog('Server started in development mode');
    devLog('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        providers,
        categories
    });
});
