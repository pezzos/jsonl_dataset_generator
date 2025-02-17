let topics = JSON.parse(localStorage.getItem('topics') || '[]').map(t => {
    return typeof t === 'string' ? {
        value: t,
        origin: 'manual',
        parentTopic: null,
        smartTags: []
    } : t;
});
let questions = JSON.parse(localStorage.getItem('questions') || '[]');
let faqs = JSON.parse(localStorage.getItem('faqs') || '[]');
let usedTopics = new Set(JSON.parse(localStorage.getItem('usedTopics') || '[]'));
let activeTopics = new Set(JSON.parse(localStorage.getItem('activeTopics') || '[]'));

// Configuration of providers and categories
const providers = ["GPT-4", "Claude", "Google"];
const providerMapping = {
    "GPT-4": "openai",
    "Claude": "anthropic",
    "Google": "google"
};
const reverseProviderMapping = {
    "openai": "GPT-4",
    "anthropic": "Claude",
    "google": "Google"
};
const categories = [
    "Common Questions",
    "Technical Questions",
    "In-Depth Questions",
    "Creative Questions",
    "Unasked but Interesting"
];

// Available models configuration
const availableModels = {
    openai: [
        { value: "disabled", label: "Disabled" },
        { value: "gpt-4o", label: "GPT-4o" },
        { value: "gpt-4o-mini", label: "GPT-4o-mini" }
    ],
    anthropic: [
        { value: "disabled", label: "Disabled" },
        { value: "claude-3-opus", label: "Claude 3 Opus" },
        { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
        { value: "claude-3.5-haiku", label: "Claude 3.5 Haiku" }
    ],
    google: [
        { value: "disabled", label: "Disabled" },
        { value: "gemini-pro", label: "Gemini Pro" }
    ]
};

// Configuration par défaut des modèles
const defaultModelSettings = {
    generateTags: { openai: "gpt-4o", anthropic: "claude-3.5-sonnet", google: "gemini-pro" },
    smartVariations: { openai: "gpt-4o", anthropic: "claude-3.5-sonnet", google: "gemini-pro" },
    generateQuestions: { openai: "gpt-4o", anthropic: "claude-3.5-sonnet", google: "gemini-pro" },
    smartSort: { openai: "disabled", anthropic: "claude-3.5-sonnet", google: "disabled" },
    generateFAQ: {
        openai: { model: "gpt-4o", language: "en" },
        anthropic: { model: "claude-3.5-sonnet", language: "en" },
        google: { model: "gemini-pro", language: "en" }
    }
};

// Fonction utilitaire pour faire une fusion profonde des objets
function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] instanceof Object && key in target) {
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

// Initialisation des modelSettings
const modelSettings = (() => {
    const savedSettings = localStorage.getItem('modelSettings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            // Faire une copie profonde des paramètres par défaut
            const mergedSettings = JSON.parse(JSON.stringify(defaultModelSettings));
            // Fusionner avec les paramètres sauvegardés
            return deepMerge(mergedSettings, parsed);
        } catch (e) {
            console.error('Error loading settings:', e);
            return JSON.parse(JSON.stringify(defaultModelSettings));
        }
    }
    return JSON.parse(JSON.stringify(defaultModelSettings));
})();

// Mode dev pour le logging
const isDev = localStorage.getItem('devMode') === 'true';
function devLog(...args) {
    if (isDev) {
        console.log('[DEV]', ...args);
    }
}

// Fonction pour générer le prompt pour chaque catégorie
function generatePromptForCategory(topic, category) {
    const categoryPrompts = {
        "Common Questions": `Retourne moi une liste de 5 questions qui sont fréquemment posées sur le sujet "${topic}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Technical Questions": `Retourne moi une liste de 5 questions qui sont techniques sur le sujet "${topic}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "In-Depth Questions": `Retourne moi une liste de 5 questions qui permettent d'aller plus loin sur le sujet "${topic}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Creative Questions": `Retourne moi une liste de 5 questions qui sont originales ou farfelues sur le sujet "${topic}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`,
        "Unasked but Interesting": `Retourne moi une liste de 5 questions qui sont rarement posées mais qui devraient l'être sur le sujet "${topic}". Réponds uniquement avec les questions, une par ligne, sans numérotation ni formatage.`
    };
    return categoryPrompts[category];
}

function saveToLocalStorage() {
    const normalizedTopics = topics.map(t => ({
        ...t,
        smartTags: t.smartTags ? t.smartTags.map(normalizeTag) : []
    }));

    localStorage.setItem('topics', JSON.stringify(normalizedTopics));
    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('faqs', JSON.stringify(faqs));
    localStorage.setItem('usedTopics', JSON.stringify([...usedTopics]));
    localStorage.setItem('activeTopics', JSON.stringify([...activeTopics]));
    localStorage.setItem('modelSettings', JSON.stringify(modelSettings));
    localStorage.setItem('tagColorMap', JSON.stringify(Array.from(tagColorMap.entries())));

    devLog('Saving modelSettings:', modelSettings);
}

let topicsTable;
let questionsTable;
let faqTable;

// Traduction française pour DataTables
const dataTablesFrench = {
    "emptyTable": "No data available",
    "info": "Showing _START_ to _END_ of _TOTAL_ entries",
    "infoEmpty": "Showing 0 to 0 of 0 entries",
    "infoFiltered": "(filtered from _MAX_ total entries)",
    "lengthMenu": "Show _MENU_ entries",
    "loadingRecords": "Loading...",
    "processing": "Processing...",
    "search": "Search:",
    "zeroRecords": "No matching records found",
    "paginate": {
        "first": "First",
        "last": "Last",
        "next": "Next",
        "previous": "Previous"
    }
};

// Configuration commune pour les DataTables
const dataTablesConfig = {
    responsive: true,
    language: dataTablesFrench,
    pageLength: 10,
    lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "All"]],
    dom: '<"top"lf>rt<"bottom"ip><"clear">'
};

// Ajout des variables pour la sélection
let selectedTopics = new Set();
let isSelectAllActive = false;

// Ajout d'un Map pour stocker les couleurs des tags
let tagColorMap = new Map();
const colorClasses = [
    'tag-color-1', // bleu
    'tag-color-2', // vert
    'tag-color-3', // rose
    'tag-color-4', // violet
    'tag-color-5'  // orange
];

// Fonction pour normaliser les tags (uniquement espaces -> underscores)
function normalizeTag(tag) {
    return tag.trim().replace(/\s+/g, '_');
}

// Modifier la fonction getTagColorClass pour utiliser les tags normalisés
function getTagColorClass(tag) {
    const normalizedTag = normalizeTag(tag);
    if (!tagColorMap.has(normalizedTag)) {
        const colorIndex = tagColorMap.size % colorClasses.length;
        tagColorMap.set(normalizedTag, colorClasses[colorIndex]);
    }
    return tagColorMap.get(normalizedTag);
}

// Déplacer les event listeners dans une fonction qui sera appelée après le chargement du DOM
function initializeEventListeners() {
    const buttons = {
        'generate-tags-btn': async () => {
            const selectedTopics = getSelectedTopics();
            if (selectedTopics.length === 0) {
                alert('Please select at least one topic');
                return;
            }

            for (const topic of selectedTopics) {
                try {
                    const tags = await generateTags(topic.name);
                    topic.tags = tags;
                    updateTopicInTable(topic);
                } catch (error) {
                    alert(`Failed to generate tags for topic: ${topic.name}`);
                }
            }
        },
        'generate-variations-btn': async () => {
            const selectedTopics = getSelectedTopics();
            if (selectedTopics.length === 0) {
                alert('Please select at least one topic');
                return;
            }

            for (const topic of selectedTopics) {
                try {
                    const variations = await generateSmartVariations(topic.name);
                    topic.variations = variations;
                    updateTopicInTable(topic);
                } catch (error) {
                    alert(`Failed to generate variations for topic: ${topic.name}`);
                }
            }
        }
    };

    // Add event listeners safely
    Object.entries(buttons).forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', handler);
        }
    });
}

// Mettre à jour l'initialisation du DOM
document.addEventListener('DOMContentLoaded', () => {
    initializeAccordions();
    initializeTables();
    initializeSettings();
    initializeManualForms();
    initializeEventListeners();
});

function initializeAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.accordion-section');
            section.classList.toggle('closed');

            // Save accordion state
            const accordionStates = JSON.parse(localStorage.getItem('accordionStates') || '{}');
            accordionStates[section.id] = !section.classList.contains('closed');
            localStorage.setItem('accordionStates', JSON.stringify(accordionStates));
        });
    });

    // Restore accordion states
    const accordionStates = JSON.parse(localStorage.getItem('accordionStates') || '{}');
    Object.entries(accordionStates).forEach(([id, isOpen]) => {
        const section = document.getElementById(id);
        if (section) {
            section.classList.toggle('closed', !isOpen);
        }
    });
}

function initializeTables() {
    // Topics table
    topicsTable = $('#topics-table').DataTable({
        ...dataTablesConfig,
        columnDefs: [
            {
                targets: [0, 5], // Selection and Actions columns
                orderable: false,
                searchable: false
            }
        ],
        order: [[1, 'asc']] // Sort by topic name by default
    });

    // Questions table
    questionsTable = $('#questions-table').DataTable({
        ...dataTablesConfig,
        columnDefs: [
            {
                targets: [1, 6], // Selection and Action columns
                orderable: false,
                searchable: false
            }
        ],
        order: [[0, 'asc']], // Sort by ID by default
        drawCallback: function() {
            updateQuestionCount();
        }
    });

    // FAQ table
    faqTable = $('#faq-table').DataTable({
        ...dataTablesConfig,
        columnDefs: [
            {
                targets: [1, 5], // Selection and Action columns
                orderable: false,
                searchable: false
            }
        ],
        order: [[0, 'asc']], // Sort by ID by default
        drawCallback: function() {
            updateFaqCount();
        }
    });
}

async function loadInitialData() {
    try {
        // Charger les providers disponibles
        const response = await fetch('/api/providers');
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.providers)) {
                providers.length = 0;
                providers.push(...data.providers);
                devLog('Available providers:', providers);
            }
        }

        // Rafraîchir les tableaux avec les données existantes
        refreshQuestionsTable();
        refreshFaqTable();
    } catch (error) {
        console.error('Failed to load initial data:', error);
        devLog('Initialization error:', error);
    }
}

document.getElementById('add-topic-btn').addEventListener('click', async () => {
    const input = document.getElementById('topic-input');
    const topic = input.value.trim();
    if (topic) {
        const newTopic = {
            value: topic,
            origin: 'manual',
            parentTopic: null,
            smartTags: []
        };

        try {
            const existingTags = new Set(
                topics.flatMap(t => t.smartTags)
            );

            const response = await fetch('/api/generateSmartTags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: topic,
                    existingTags: Array.from(existingTags)
                })
            });

            if (response.ok) {
                const data = await response.json();
                newTopic.smartTags = data.tags;
            }
        } catch (error) {
            console.error('Error generating smart tags:', error);
        }

        topics.push(newTopic);
        input.value = "";
        refreshTopicsList();
        saveToLocalStorage();
    }
});

function updateQuestionCount() {
    document.getElementById('questions-count').textContent = questions.length;
}

function updateFaqCount() {
    document.getElementById('faq-count').textContent = faqs.length;
}

function refreshTopicsList() {
    topicsTable.clear();

    topics.forEach((topic, index) => {
        const row = [
            `<input type="checkbox" class="topic-checkbox" ${selectedTopics.has(topic.value) ? 'checked' : ''}>`,
            `<div class="topic-cell">${topic.value}</div>`,
            `<div class="origin-cell"><span class="badge origin-badge" data-origin="${topic.origin}">${topic.origin === 'manual' ? 'manual' : topic.parentTopic}</span></div>`,
            `<div class="tags-cell">${renderSmartTags(topic.smartTags)}</div>`,
            `<div class="status-cell">${renderStatusBadge(topic.value)}</div>`,
            renderActionButtons(topic, index)
        ];

        topicsTable.row.add(row);
    });

    topicsTable.draw();
    updateTopicCount();
}

function renderSmartTags(tags) {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => {
        const colorClass = getTagColorClass(tag);
        return `<span class="badge tag-badge ${colorClass}">${tag}<span class="tag-delete">×</span></span>`;
    }).join('');
}

function renderStatusBadge(topicValue) {
    const isUsed = usedTopics.has(topicValue);
    const isActive = activeTopics.has(topicValue);
    if (!isUsed) return '';
    return `<span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>`;
}

function renderActionButtons(topic, index) {
    const buttons = [];

    if (usedTopics.has(topic.value)) {
        buttons.push(`<button class="toggle-status-btn" data-index="${index}">${activeTopics.has(topic.value) ? 'Deactivate' : 'Activate'}</button>`);
    }

    buttons.push(`<button class="smart-decline-btn" data-index="${index}">Smart Variations</button>`);
    buttons.push(`<button class="delete-btn" data-index="${index}">Delete</button>`);

    return buttons.join('');
}

function updateTopicCount() {
    document.getElementById('topics-count').textContent = topics.length;
}

document.getElementById('generate-questions-btn').addEventListener('click', async () => {
    const activeKw = topics.filter(kw => !usedTopics.has(kw.value) || activeTopics.has(kw.value));

    if (activeKw.length === 0) {
        alert("Veuillez ajouter au moins un mot clé ou activer un mot clé existant.");
        return;
    }

    const generateBtn = document.getElementById('generate-questions-btn');
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');

    let idCounter = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
    let errorCount = 0;

    const generateQuestionsForProvider = async (provider, topic, category) => {
        const mappedProvider = providerMapping[provider];
        const model = modelSettings.generateQuestions[mappedProvider];
        if (model === 'disabled') {
            devLog(`Provider ${provider} is disabled for question generation`);
            return [];
        }

        try {
            devLog(`Generating questions for: ${topic} (${provider}, ${category})`);
            const response = await fetch('/api/generateQuestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords: [topic],
                    provider: provider,
                    category: category
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                errorCount++;
                const errorMessage = `Error with ${provider} for ${topic} (${category}): ${errorData.error}`;
                console.error(errorMessage);
                devLog(`API Error:`, errorData);
                return [];
            }

            const data = await response.json();

            // Vérification et nettoyage des questions
            if (!Array.isArray(data.questions)) {
                devLog(`Unexpected response format from ${provider}:`, data);
                return [];
            }

            devLog(`Generated ${data.questions.length} questions for ${topic} (${provider}, ${category})`);

            return data.questions.map(q => {
                // Vérification du format de la question
                const questionText = typeof q === 'string' ? q :
                                   typeof q.question === 'string' ? q.question :
                                   JSON.stringify(q);

                return {
                    id: idCounter++,
                    topic,
                    source: provider,
                    category,
                    question: questionText.trim()
                };
            }).filter(q => q.question && q.question.length > 0);

        } catch (error) {
            errorCount++;
            console.error(`Error with ${provider} for ${topic} (${category}):`, error);
            devLog(`Network/Processing Error:`, error);
            return [];
        }
    };

    try {
        for (const topic of activeKw) {
            devLog(`Processing topic: ${topic}`);
            // Création des promesses pour tous les providers et catégories
            const allPromises = providers.flatMap(provider =>
                categories.map(category =>
                    generateQuestionsForProvider(provider, topic, category)
                        .then(newQuestions => {
                            if (newQuestions.length > 0) {
                                devLog(`Adding ${newQuestions.length} questions from ${provider} (${category})`);
                                questions.push(...newQuestions);
                                refreshQuestionsTable();
                                saveToLocalStorage();
                            }
                        })
                        .catch(error => {
                            errorCount++;
                            console.error(`Failed to process ${provider} for ${topic} (${category}):`, error);
                            devLog(`Processing Error:`, error);
                        })
                )
            );

            // Exécution parallèle de toutes les requêtes
            await Promise.all(allPromises);

            // Marquer le mot-clé comme utilisé après le traitement
            usedTopics.add(topic);
            activeTopics.delete(topic);
        }

        if (errorCount > 0) {
            const message = `${errorCount} erreur(s) se sont produites pendant la génération. Vérifiez la console pour plus de détails.`;
            console.warn(message);
            alert(message);
        }
    } catch (error) {
        console.error('Error during question generation:', error);
        devLog('Fatal error during generation:', error);
        alert("Une erreur s'est produite pendant la génération des questions. Vérifiez la console pour plus de détails.");
    } finally {
        generateBtn.disabled = false;
        generateBtn.classList.remove('loading');
        refreshTopicsList();
        refreshQuestionsTable();
        saveToLocalStorage();
    }
});

function refreshQuestionsTable() {
    if (!questionsTable) return;

    questionsTable.clear();

    const rows = questions.map(q => [
        q.id,
        `<input type="checkbox" data-id="${q.id}">`,
        `<div class="question-cell">${q.question}</div>`,
        `<div class="source-cell">${q.source}</div>`,
        `<div class="topic-cell">${q.topic}</div>`,
        `<div class="category-cell">${q.category}</div>`,
        `<button class="table-action-btn" onclick="deleteQuestion(${q.id})">Supprimer</button>`
    ]);

    questionsTable.rows.add(rows).draw();
    updateQuestionCount();
}

function refreshFaqTable() {
    if (!faqTable) return;

    faqTable.clear();

    const rows = faqs.map(faq => [
        faq.id,
        `<input type="checkbox" data-id="${faq.id}">`,
        `<div class="question-cell">${faq.question}</div>`,
        `<div class="answer-cell">${faq.answer}</div>`,
        `<div class="topic-cell">${faq.topic}</div>`,
        `<button class="table-action-btn" onclick="deleteFaq(${faq.id})">Supprimer</button>`
    ]);

    faqTable.rows.add(rows).draw();
    updateFaqCount();
}

// Fonctions auxiliaires pour la suppression
function deleteQuestion(id) {
    const index = questions.findIndex(q => q.id === id);
    if (index !== -1) {
        questions.splice(index, 1);
        refreshQuestionsTable();
        saveToLocalStorage();
    }
}

function deleteFaq(id) {
    const index = faqs.findIndex(f => f.id === id);
    if (index !== -1) {
        faqs.splice(index, 1);
        refreshFaqTable();
        saveToLocalStorage();
    }
}

// Modification des gestionnaires d'événements de suppression multiple
document.getElementById('delete-selected-questions-btn').addEventListener('click', () => {
    const selectedIds = [];
    questionsTable.$('input[type="checkbox"]:checked').each(function() {
        selectedIds.push(parseInt($(this).data('id')));
    });

    questions = questions.filter(q => !selectedIds.includes(q.id));
    refreshQuestionsTable();
    saveToLocalStorage();
});

document.getElementById('delete-selected-faq-btn').addEventListener('click', () => {
    const selectedIds = [];
    faqTable.$('input[type="checkbox"]:checked').each(function() {
        selectedIds.push(parseInt($(this).data('id')));
    });

    faqs = faqs.filter(f => !selectedIds.includes(f.id));
    refreshFaqTable();
    saveToLocalStorage();
});

document.getElementById('smart-sort-btn').addEventListener('click', () => {
    fetch('/api/smartSort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                questions = data.questions;
                refreshQuestionsTable();
                saveToLocalStorage();
            }
        })
        .catch(err => {
            console.error(err);
            alert("Erreur pendant le traitement Smart Sort.");
        });
});

document.getElementById('generate-faq-btn').addEventListener('click', () => {
    if (questions.length === 0) {
        alert("Aucune question disponible pour générer la FAQ.");
        return;
    }
    fetch('/api/generateFAQ', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                faqs = data.faqs;
                refreshFaqTable();
            }
        })
        .catch(err => {
            console.error(err);
            alert("Erreur pendant la génération de la FAQ.");
        });
});

document.getElementById('export-faq-btn').addEventListener('click', () => {
    window.location.href = '/api/exportFAQ';
});

function initializeManualForms() {
    // Gestionnaire pour l'ajout manuel de questions
    document.getElementById('add-manual-question-btn').addEventListener('click', () => {
        const question = document.getElementById('manual-question-input').value.trim();
        const category = document.getElementById('manual-question-category').value;
        const topic = document.getElementById('manual-question-topic').value.trim();

        if (!question || !category || !topic) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
        questions.push({
            id: newId,
            question,
            category,
            topic,
            source: 'Manuel'
        });

        // Réinitialiser le formulaire
        document.getElementById('manual-question-input').value = '';
        document.getElementById('manual-question-category').value = '';
        document.getElementById('manual-question-topic').value = '';

        refreshQuestionsTable();
        saveToLocalStorage();
    });

    // Gestionnaire pour l'ajout manuel de FAQ
    document.getElementById('add-manual-faq-btn').addEventListener('click', () => {
        const question = document.getElementById('manual-faq-question').value.trim();
        const answer = document.getElementById('manual-faq-answer').value.trim();
        const topic = document.getElementById('manual-faq-topic').value.trim();

        if (!question || !answer || !topic) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const newId = faqs.length > 0 ? Math.max(...faqs.map(f => f.id)) + 1 : 1;
        faqs.push({
            id: newId,
            question,
            answer,
            topic
        });

        // Réinitialiser le formulaire
        document.getElementById('manual-faq-question').value = '';
        document.getElementById('manual-faq-answer').value = '';
        document.getElementById('manual-faq-topic').value = '';

        refreshFaqTable();
        saveToLocalStorage();
    });
}

function initializeSettings() {
    devLog('Initializing settings with:', modelSettings);

    // Remplir les listes déroulantes avec les modèles disponibles
    document.querySelectorAll('.model-select').forEach(select => {
        const provider = select.dataset.provider;
        const step = select.dataset.step;

        if (!provider || !step || !availableModels[provider]) {
            console.warn(`Missing or invalid data attributes for select:`, select);
            return;
        }

        // Clear existing options
        select.innerHTML = '';

        // Ajouter les options
        availableModels[provider].forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            select.appendChild(option);
        });

        // Sélectionner le modèle actuel
        if (step === 'generateFAQ') {
            const currentModel = modelSettings[step][provider]?.model;
            devLog(`Setting ${step} ${provider} model to:`, currentModel);
            if (currentModel) {
                select.value = currentModel;
            }
        } else {
            const currentModel = modelSettings[step][provider];
            devLog(`Setting ${step} ${provider} model to:`, currentModel);
            if (currentModel) {
                select.value = currentModel;
            }
        }

        // Ajouter le gestionnaire d'événements
        select.addEventListener('change', () => {
            if (step === 'generateFAQ') {
                if (!modelSettings[step][provider]) {
                    modelSettings[step][provider] = {
                        model: select.value,
                        language: modelSettings[step][provider]?.language || 'en'
                    };
                } else {
                    modelSettings[step][provider].model = select.value;
                }
            } else {
                modelSettings[step][provider] = select.value;
            }
            saveToLocalStorage();
            devLog('Updated modelSettings:', modelSettings);
        });
    });

    // Initialize language selectors for FAQ Generation
    document.querySelectorAll('.language-select').forEach(select => {
        const provider = select.dataset.provider;

        if (!provider || !modelSettings.generateFAQ[provider]) {
            console.warn(`Missing or invalid provider for language select:`, select);
            return;
        }

        const currentLanguage = modelSettings.generateFAQ[provider].language;
        devLog(`Setting FAQ ${provider} language to:`, currentLanguage);
        if (currentLanguage) {
            select.value = currentLanguage;
        }

        // Add change event listener
        select.addEventListener('change', () => {
            if (!modelSettings.generateFAQ[provider]) {
                modelSettings.generateFAQ[provider] = {
                    model: modelSettings.generateFAQ[provider]?.model || 'gpt-4o',
                    language: select.value
                };
            } else {
                modelSettings.generateFAQ[provider].language = select.value;
            }
            saveToLocalStorage();
            devLog('Updated language settings:', modelSettings.generateFAQ);
        });
    });

    // Gestionnaire pour la sauvegarde des paramètres
    const saveButton = document.getElementById('save-settings-btn');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            saveToLocalStorage();
            alert('Settings saved successfully');
        });
    }
}

function getSelectedTopics() {
    const selectedTopics = [];
    topicsTable.$('input.topic-checkbox:checked').each(function() {
        const row = topicsTable.row($(this).closest('tr'));
        const rowData = row.data();
        if (rowData) {
            const topicCell = $(rowData[1]); // Index 1 contient la cellule du topic
            const topicName = topicCell.text().trim();
            const topic = topics.find(t => t.value === topicName);
            if (topic) {
                selectedTopics.push(topic);
            }
        }
    });
    return selectedTopics;
}
