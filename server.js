app.post('/api/generateTags', async (req, res) => {
    try {
        const { topic, model, provider } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'Please provide a topic' });
        }

        let prompt = `Generate a comprehensive list of relevant tags for the following topic: "${topic}".
        The tags should cover key concepts, related subjects, and important terminology.
        Format the response as a comma-separated list of tags.`;

        let response;
        if (provider === 'openai') {
            response = await askGPT4(prompt, model);
        } else if (provider === 'anthropic') {
            response = await askClaude(prompt, model);
        } else if (provider === 'google') {
            response = await askGemini(prompt);
        }

        res.json({ tags: response.split(',').map(tag => tag.trim()) });
    } catch (error) {
        console.error('Error generating tags:', error);
        res.status(500).json({ error: 'Failed to generate tags' });
    }
});

app.post('/api/smartVariations', async (req, res) => {
    try {
        const { topic, model, provider } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'Please provide a topic' });
        }

        let prompt = `Generate smart variations and alternative phrasings for the following topic: "${topic}".
        Consider synonyms, related concepts, and different ways to express the same idea.
        Format the response as a comma-separated list.`;

        let response;
        if (provider === 'openai') {
            response = await askGPT4(prompt, model);
        } else if (provider === 'anthropic') {
            response = await askClaude(prompt, model);
        } else if (provider === 'google') {
            response = await askGemini(prompt);
        }

        res.json({ variations: response.split(',').map(variation => variation.trim()) });
    } catch (error) {
        console.error('Error generating variations:', error);
        res.status(500).json({ error: 'Failed to generate variations' });
    }
});

app.post('/api/generateFAQ', async (req, res) => {
    try {
        const { questions, model, provider, language } = req.body;
        if (!questions || !questions.length) {
            return res.status(400).json({ error: 'Please provide questions' });
        }

        let prompt = `Generate detailed answers for the following questions. Provide the answers in ${language}:\n\n`;
        questions.forEach((q, i) => {
            prompt += `${i + 1}. ${q}\n`;
        });

        let response;
        if (provider === 'openai') {
            response = await askGPT4(prompt, model);
        } else if (provider === 'anthropic') {
            response = await askClaude(prompt, model);
        } else if (provider === 'google') {
            response = await askGemini(prompt);
        }

        res.json({ faq: response });
    } catch (error) {
        console.error('Error generating FAQ:', error);
        res.status(500).json({ error: 'Failed to generate FAQ' });
    }
});
