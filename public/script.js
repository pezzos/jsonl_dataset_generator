let keywords = JSON.parse(localStorage.getItem('keywords') || '[]').map(k => {
    return typeof k === 'string' ? {
        value: k,
        origin: 'manual',
        parentKeyword: null,
        smartTags: []
    } : k;
});
let questions = JSON.parse(localStorage.getItem('questions') || '[]');
let faqs = JSON.parse(localStorage.getItem('faqs') || '[]');
let usedKeywords = new Set(JSON.parse(localStorage.getItem('usedKeywords') || '[]'));
let activeKeywords = new Set(JSON.parse(localStorage.getItem('activeKeywords') || '[]'));

// Configuration des providers et catégories
const providers = ["GPT-4", "Claude", "Google"];
const categories = [
    "Questions habituelles",
    "Questions techniques",
    "Questions pour en comprendre plus",
    "Questions farfelues",
    "Questions non posées mais intéressantes"
];

// Configuration des modèles disponibles par provider
const availableModels = {
    openai: [
        { value: "disabled", label: "Désactivé" },
        { value: "gpt-4", label: "GPT-4" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" }
    ],
    anthropic: [
        { value: "disabled", label: "Désactivé" },
        { value: "claude-3-opus", label: "Claude 3 Opus" },
        { value: "claude-3-sonnet", label: "Claude 3 Sonnet" },
        { value: "claude-2.1", label: "Claude 2.1" }
    ],
    google: [
        { value: "disabled", label: "Désactivé" },
        { value: "gemini-pro", label: "Gemini Pro" },
        { value: "gemini-ultra", label: "Gemini Ultra" }
    ]
};

// Configuration par défaut des modèles
let modelSettings = JSON.parse(localStorage.getItem('modelSettings') || JSON.stringify({
    generateQuestions: {
        openai: "gpt-4",
        anthropic: "claude-3-opus",
        google: "gemini-pro"
    },
    smartSort: {
        openai: "disabled",
        anthropic: "claude-3-opus",
        google: "disabled"
    },
    generateFAQ: {
        openai: "gpt-4",
        anthropic: "claude-3-opus",
        google: "gemini-pro"
    }
}));

// Mode dev pour le logging
const isDev = localStorage.getItem('devMode') === 'true';
function devLog(...args) {
    if (isDev) {
        console.log('[DEV]', ...args);
    }
}

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

function saveToLocalStorage() {
    // Normaliser tous les tags avant la sauvegarde
    const normalizedKeywords = keywords.map(kw => ({
        ...kw,
        smartTags: kw.smartTags ? kw.smartTags.map(normalizeTag) : []
    }));

    localStorage.setItem('keywords', JSON.stringify(normalizedKeywords));
    localStorage.setItem('questions', JSON.stringify(questions));
    localStorage.setItem('faqs', JSON.stringify(faqs));
    localStorage.setItem('usedKeywords', JSON.stringify([...usedKeywords]));
    localStorage.setItem('activeKeywords', JSON.stringify([...activeKeywords]));
    localStorage.setItem('modelSettings', JSON.stringify(modelSettings));
    localStorage.setItem('tagColorMap', JSON.stringify(Array.from(tagColorMap.entries())));
}

let questionsTable;
let faqTable;

// Traduction française pour DataTables
const dataTablesFrench = {
    "emptyTable": "Aucune donnée disponible",
    "info": "Affichage de _START_ à _END_ sur _TOTAL_ entrées",
    "infoEmpty": "Affichage de 0 à 0 sur 0 entrées",
    "infoFiltered": "(filtré sur _MAX_ entrées totales)",
    "lengthMenu": "Afficher _MENU_ entrées",
    "loadingRecords": "Chargement...",
    "processing": "Traitement...",
    "search": "Rechercher :",
    "zeroRecords": "Aucun résultat trouvé",
    "paginate": {
        "first": "Premier",
        "last": "Dernier",
        "next": "Suivant",
        "previous": "Précédent"
    }
};

// Configuration commune pour les DataTables
const dataTablesConfig = {
    responsive: true,
    language: dataTablesFrench,
    pageLength: 10,
    lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "Tout"]],
    dom: '<"top"lf>rt<"bottom"ip><"clear">'
};

// Ajout des variables pour la sélection
let selectedKeywords = new Set();
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

document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser l'interface de base immédiatement
    refreshKeywordList();

    // Initialiser les tableaux avec une configuration de base
    initializeTables();

    // Charger les données en arrière-plan
    await loadInitialData();

    // Initialiser les formulaires d'ajout manuel
    initializeManualForms();

    // Initialiser les paramètres
    initializeSettings();

    // Export/Import event listeners
    document.getElementById('export-keywords-btn').addEventListener('click', exportKeywords);
    document.getElementById('import-keywords-btn').addEventListener('click', () => {
        document.getElementById('import-keywords-input').click();
    });
    document.getElementById('import-keywords-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importKeywords(e.target.files[0]);
            e.target.value = ''; // Reset input
        }
    });

    // Ajout de l'event listener pour la génération des tags manquants
    document.getElementById('generate-missing-tags-btn').addEventListener('click', generateMissingTags);

    document.getElementById('export-questions-btn').addEventListener('click', exportQuestions);
    document.getElementById('import-questions-btn').addEventListener('click', () => {
        document.getElementById('import-questions-input').click();
    });
    document.getElementById('import-questions-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importQuestions(e.target.files[0]);
            e.target.value = ''; // Reset input
        }
    });

    // Tout sélectionner/désélectionner
    document.getElementById('toggle-select-all-btn').addEventListener('click', () => {
        isSelectAllActive = !isSelectAllActive;
        const btn = document.getElementById('toggle-select-all-btn');
        btn.textContent = isSelectAllActive ? 'Tout désélectionner' : 'Tout sélectionner';

        const visibleKeywords = Array.from(document.querySelectorAll('#keyword-list li'))
            .filter(li => li.style.display !== 'none')
            .map(li => li.querySelector('span').textContent);

        if (isSelectAllActive) {
            visibleKeywords.forEach(kw => selectedKeywords.add(kw));
        } else {
            visibleKeywords.forEach(kw => selectedKeywords.delete(kw));
        }
        refreshKeywordList();
    });

    // Supprimer tout
    document.getElementById('delete-all-keywords-btn').addEventListener('click', () => {
        if (confirm('Êtes-vous sûr de vouloir supprimer tous les mots-clés ?')) {
            keywords = [];
            selectedKeywords.clear();
            usedKeywords.clear();
            activeKeywords.clear();
            saveToLocalStorage();
            refreshKeywordList();
        }
    });

    // Supprimer filtrés
    document.getElementById('delete-filtered-keywords-btn').addEventListener('click', () => {
        const visibleKeywords = Array.from(document.querySelectorAll('#keyword-list li'))
            .filter(li => li.style.display !== 'none')
            .map(li => li.querySelector('span').textContent);

        if (visibleKeywords.length === 0) return;

        if (confirm(`Êtes-vous sûr de vouloir supprimer les ${visibleKeywords.length} mots-clés filtrés ?`)) {
            keywords = keywords.filter(kw => !visibleKeywords.includes(kw.value));
            visibleKeywords.forEach(kw => {
                selectedKeywords.delete(kw);
                usedKeywords.delete(kw);
                activeKeywords.delete(kw);
            });
            saveToLocalStorage();
            refreshKeywordList();
        }
    });

    // Supprimer sélectionnés
    document.getElementById('delete-selected-keywords-btn').addEventListener('click', () => {
        if (selectedKeywords.size === 0) return;

        if (confirm(`Êtes-vous sûr de vouloir supprimer les ${selectedKeywords.size} mots-clés sélectionnés ?`)) {
            keywords = keywords.filter(kw => !selectedKeywords.has(kw.value));
            selectedKeywords.forEach(kw => {
                usedKeywords.delete(kw);
                activeKeywords.delete(kw);
            });
            selectedKeywords.clear();
            saveToLocalStorage();
            refreshKeywordList();
        }
    });

    // Restaurer la map des couleurs
    const savedTagColorMap = localStorage.getItem('tagColorMap');
    if (savedTagColorMap) {
        const savedMap = JSON.parse(savedTagColorMap);
        // Normaliser les clés de la map des couleurs
        tagColorMap = new Map(
            savedMap.map(([tag, color]) => [normalizeTag(tag), color])
        );
    }

    // Normaliser les tags existants
    keywords = keywords.map(kw => ({
        ...kw,
        smartTags: kw.smartTags ? kw.smartTags.map(normalizeTag) : []
    }));
});

function initializeTables() {
    // Configuration pour la table des questions
    questionsTable = $('#questions-table').DataTable({
        ...dataTablesConfig,
        columnDefs: [
            {
                targets: [1, 6], // Colonnes Sélection et Action
                orderable: false,
                searchable: false
            }
        ],
        order: [[0, 'asc']], // Tri par défaut sur l'ID
        drawCallback: function() {
            updateQuestionCount();
        }
    });

    // Configuration pour la table FAQ
    faqTable = $('#faq-table').DataTable({
        ...dataTablesConfig,
        columnDefs: [
            {
                targets: [1, 5], // Colonnes Sélection et Action
                orderable: false,
                searchable: false
            }
        ],
        order: [[0, 'asc']], // Tri par défaut sur l'ID
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

document.getElementById('add-keyword-btn').addEventListener('click', async () => {
    const input = document.getElementById('keyword-input');
    const keyword = input.value.trim();
    if (keyword) {
        const newKeyword = {
            value: keyword,
            origin: 'manual',
            parentKeyword: null,
            smartTags: []
        };

        try {
            const existingTags = new Set(
                keywords.flatMap(k => k.smartTags)
            );

            const response = await fetch('/api/generateSmartTags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: keyword,
                    existingTags: Array.from(existingTags)
                })
            });

            if (response.ok) {
                const data = await response.json();
                newKeyword.smartTags = data.tags;
            }
        } catch (error) {
            console.error('Error generating smart tags:', error);
        }

        keywords.push(newKeyword);
        input.value = "";
        refreshKeywordList();
        saveToLocalStorage();
    }
});

function updateQuestionCount() {
    document.getElementById('questions-count').textContent = questions.length;
}

function updateFaqCount() {
    document.getElementById('faq-count').textContent = faqs.length;
}

function refreshKeywordList() {
    // Créer le conteneur de filtres s'il n'existe pas
    let filterContainer = document.getElementById('keyword-filters');
    if (!filterContainer) {
        filterContainer = document.createElement('div');
        filterContainer.id = 'keyword-filters';
        filterContainer.className = 'keyword-filters';
        document.getElementById('keyword-list').parentElement.insertBefore(filterContainer, document.getElementById('keyword-list'));
    }

    // Récupérer tous les tags uniques et les trier
    const allTags = new Set();
    keywords.forEach(kw => {
        if (kw.smartTags) {
            // Normaliser les tags existants
            kw.smartTags = kw.smartTags.map(normalizeTag);
            kw.smartTags.forEach(tag => allTags.add(tag));
        }
    });
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    // Créer les filtres
    filterContainer.innerHTML = '<div class="filter-label">Filtrer par tags:</div>';
    const activeFilters = new Set();

    sortedTags.forEach(tag => {
        const tagBtn = document.createElement('button');
        const colorClass = getTagColorClass(tag);
        tagBtn.className = `filter-tag tag-badge ${colorClass}`;
        tagBtn.innerHTML = `${tag}<span class="tag-delete">×</span>`;

        // Gestionnaire pour le clic sur le tag (filtrage)
        tagBtn.onclick = (e) => {
            if (e.target.classList.contains('tag-delete')) return; // Ignore le clic sur la croix
            tagBtn.classList.toggle('active');
            if (activeFilters.has(tag)) {
                activeFilters.delete(tag);
            } else {
                activeFilters.add(tag);
            }
            // Filtrer la liste
            document.querySelectorAll('#keyword-list li').forEach(li => {
                const kw = keywords.find(k => k.value === li.querySelector('span').textContent);
                if (activeFilters.size === 0 ||
                    (kw.smartTags && Array.from(activeFilters).every(tag => kw.smartTags.includes(tag)))) {
                    li.style.display = '';
                } else {
                    li.style.display = 'none';
                }
            });
        };

        // Gestionnaire pour la suppression du tag
        tagBtn.querySelector('.tag-delete').onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Êtes-vous sûr de vouloir supprimer le tag "${tag}" de tous les mots-clés ?`)) {
                removeTagFromAllKeywords(tag);
            }
        };

        filterContainer.appendChild(tagBtn);
    });

    const list = document.getElementById('keyword-list');
    list.innerHTML = "";
    keywords.forEach((kw, index) => {
        const li = document.createElement('li');
        if (usedKeywords.has(kw.value)) {
            li.classList.add('used');
        }

        // Checkbox de sélection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'keyword-checkbox';
        checkbox.checked = selectedKeywords.has(kw.value);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedKeywords.add(kw.value);
            } else {
                selectedKeywords.delete(kw.value);
                isSelectAllActive = false;
                document.getElementById('toggle-select-all-btn').textContent = 'Tout sélectionner';
            }
        });
        li.appendChild(checkbox);

        // Keyword text
        const keywordSpan = document.createElement('span');
        keywordSpan.textContent = kw.value;
        li.appendChild(keywordSpan);

        // Origin badge
        const originBadge = document.createElement('span');
        originBadge.className = 'badge origin-badge';
        originBadge.textContent = kw.origin === 'manual' ? 'manual' : kw.parentKeyword;
        originBadge.dataset.origin = kw.origin;
        li.appendChild(originBadge);

        // Smart tags container avec bouton de suppression
        if (kw.smartTags && kw.smartTags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'smart-tags';
            kw.smartTags.forEach(tag => {
                const tagSpan = document.createElement('span');
                const colorClass = getTagColorClass(tag);
                tagSpan.className = `badge tag-badge ${colorClass}`;
                tagSpan.textContent = tag;

                // Ajout du bouton de suppression du tag
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'tag-delete';
                deleteBtn.textContent = '×';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    removeTagFromAllKeywords(tag);
                };
                tagSpan.appendChild(deleteBtn);

                tagsContainer.appendChild(tagSpan);
            });
            li.appendChild(tagsContainer);
        }

        if (usedKeywords.has(kw.value)) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = `keyword-toggle ${activeKeywords.has(kw.value) ? 'active' : ''}`;
            toggleBtn.textContent = activeKeywords.has(kw.value) ? 'Activé' : 'Désactivé';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                if (activeKeywords.has(kw.value)) {
                    activeKeywords.delete(kw.value);
                    toggleBtn.textContent = 'Désactivé';
                } else {
                    activeKeywords.add(kw.value);
                    toggleBtn.textContent = 'Activé';
                }
                toggleBtn.classList.toggle('active');
                saveToLocalStorage();
            };
            li.appendChild(toggleBtn);
        }

        // Smart decline button
        const smartDeclineBtn = document.createElement('button');
        smartDeclineBtn.textContent = "Smart déclinaison";
        smartDeclineBtn.className = "smart-decline-btn";
        smartDeclineBtn.onclick = async (e) => {
            e.stopPropagation();
            smartDeclineBtn.disabled = true;
            smartDeclineBtn.textContent = "Génération...";

            try {
                const response = await fetch('/api/generateKeywordVariations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keyword: kw.value })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Erreur lors de la génération');
                }

                const data = await response.json();
                if (data.variations && Array.isArray(data.variations)) {
                    // Ajouter les variations avec leur origine
                    for (const variation of data.variations) {
                        if (!keywords.some(k => k.value === variation)) {
                            const newKeyword = {
                                value: variation,
                                origin: 'variation',
                                parentKeyword: kw.value,
                                smartTags: []
                            };

                            try {
                                const tagsResponse = await fetch('/api/generateSmartTags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ text: variation })
                                });

                                if (tagsResponse.ok) {
                                    const tagsData = await tagsResponse.json();
                                    newKeyword.smartTags = tagsData.tags;
                                }
                            } catch (error) {
                                console.error('Error generating smart tags for variation:', error);
                            }

                            keywords.push(newKeyword);
                        }
                    }
                    saveToLocalStorage();
                    refreshKeywordList();
                }
            } catch (error) {
                console.error('Erreur:', error);
                alert(error.message);
            } finally {
                smartDeclineBtn.disabled = false;
                smartDeclineBtn.textContent = "Smart déclinaison";
            }
        };
        li.appendChild(smartDeclineBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = "Supprimer";
        deleteBtn.onclick = () => {
            keywords.splice(index, 1);
            usedKeywords.delete(kw.value);
            activeKeywords.delete(kw.value);
            refreshKeywordList();
            saveToLocalStorage();
        };
        li.appendChild(deleteBtn);
        list.appendChild(li);
    });

    // Ajouter le compteur total
    const totalDiv = document.createElement('div');
    totalDiv.className = 'table-footer';
    totalDiv.textContent = `Total des mots-clés : ${keywords.length}`;
    list.parentElement.appendChild(totalDiv);
}

// Modifier la fonction removeTagFromAllKeywords pour nettoyer la map des couleurs
function removeTagFromAllKeywords(tagToRemove) {
    const normalizedTagToRemove = normalizeTag(tagToRemove);
    keywords = keywords.map(kw => ({
        ...kw,
        smartTags: kw.smartTags.map(normalizeTag).filter(tag => tag !== normalizedTagToRemove)
    }));

    const tagStillExists = keywords.some(kw => kw.smartTags.some(tag => normalizeTag(tag) === normalizedTagToRemove));
    if (!tagStillExists) {
        tagColorMap.delete(normalizedTagToRemove);
    }

    saveToLocalStorage();
    refreshKeywordList();
}

document.getElementById('generate-questions-btn').addEventListener('click', async () => {
    const activeKw = keywords.filter(kw => !usedKeywords.has(kw.value) || activeKeywords.has(kw.value));

    if (activeKw.length === 0) {
        alert("Veuillez ajouter au moins un mot clé ou activer un mot clé existant.");
        return;
    }

    const generateBtn = document.getElementById('generate-questions-btn');
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');

    let idCounter = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
    let errorCount = 0;

    const generateQuestionsForProvider = async (provider, keyword, category) => {
        const model = modelSettings.generateQuestions[provider.toLowerCase()];
        if (model === 'disabled') {
            devLog(`Provider ${provider} is disabled for question generation`);
            return [];
        }

        try {
            devLog(`Generating questions for: ${keyword} (${provider}, ${category})`);
            const response = await fetch('/api/generateQuestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords: [keyword],
                    provider: provider,
                    category: category
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                errorCount++;
                const errorMessage = `Error with ${provider} for ${keyword} (${category}): ${errorData.error}`;
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

            devLog(`Generated ${data.questions.length} questions for ${keyword} (${provider}, ${category})`);

            return data.questions.map(q => {
                // Vérification du format de la question
                const questionText = typeof q === 'string' ? q :
                                   typeof q.question === 'string' ? q.question :
                                   JSON.stringify(q);

                return {
                    id: idCounter++,
                    keyword,
                    source: provider,
                    category,
                    question: questionText.trim()
                };
            }).filter(q => q.question && q.question.length > 0);

        } catch (error) {
            errorCount++;
            console.error(`Error with ${provider} for ${keyword} (${category}):`, error);
            devLog(`Network/Processing Error:`, error);
            return [];
        }
    };

    try {
        for (const keyword of activeKw) {
            devLog(`Processing keyword: ${keyword}`);
            // Création des promesses pour tous les providers et catégories
            const allPromises = providers.flatMap(provider =>
                categories.map(category =>
                    generateQuestionsForProvider(provider, keyword, category)
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
                            console.error(`Failed to process ${provider} for ${keyword} (${category}):`, error);
                            devLog(`Processing Error:`, error);
                        })
                )
            );

            // Exécution parallèle de toutes les requêtes
            await Promise.all(allPromises);

            // Marquer le mot-clé comme utilisé après le traitement
            usedKeywords.add(keyword);
            activeKeywords.delete(keyword);
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
        refreshKeywordList();
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
        `<div class="keyword-cell">${q.keyword}</div>`,
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
        `<div class="keyword-cell">${faq.keyword}</div>`,
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
        const keyword = document.getElementById('manual-question-keyword').value.trim();

        if (!question || !category || !keyword) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
        questions.push({
            id: newId,
            question,
            category,
            keyword,
            source: 'Manuel'
        });

        // Réinitialiser le formulaire
        document.getElementById('manual-question-input').value = '';
        document.getElementById('manual-question-category').value = '';
        document.getElementById('manual-question-keyword').value = '';

        refreshQuestionsTable();
        saveToLocalStorage();
    });

    // Gestionnaire pour l'ajout manuel de FAQ
    document.getElementById('add-manual-faq-btn').addEventListener('click', () => {
        const question = document.getElementById('manual-faq-question').value.trim();
        const answer = document.getElementById('manual-faq-answer').value.trim();
        const keyword = document.getElementById('manual-faq-keyword').value.trim();

        if (!question || !answer || !keyword) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const newId = faqs.length > 0 ? Math.max(...faqs.map(f => f.id)) + 1 : 1;
        faqs.push({
            id: newId,
            question,
            answer,
            keyword
        });

        // Réinitialiser le formulaire
        document.getElementById('manual-faq-question').value = '';
        document.getElementById('manual-faq-answer').value = '';
        document.getElementById('manual-faq-keyword').value = '';

        refreshFaqTable();
        saveToLocalStorage();
    });
}

function initializeSettings() {
    // Remplir les listes déroulantes avec les modèles disponibles
    document.querySelectorAll('.model-select').forEach(select => {
        const provider = select.dataset.provider;
        const step = select.dataset.step;

        // Ajouter les options
        availableModels[provider].forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            select.appendChild(option);
        });

        // Sélectionner le modèle actuel
        select.value = modelSettings[step][provider];

        // Ajouter le gestionnaire d'événements
        select.addEventListener('change', () => {
            modelSettings[step][provider] = select.value;
        });
    });

    // Gestionnaire pour la sauvegarde des paramètres
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        localStorage.setItem('modelSettings', JSON.stringify(modelSettings));
        alert('Paramètres sauvegardés avec succès');
    });
}

// Nouvelles catégories de questions suggérées
const additionalCategories = [
    "Questions comparatives",
    "Questions d'impact sociétal",
    "Questions de perspective future",
    "Questions de mise en pratique",
    "Questions de contexte historique",
    "Questions d'éthique et de responsabilité",
    "Questions de tendances actuelles",
    "Questions de défis et solutions",
    "Questions d'innovation",
    "Questions d'expérience personnelle"
];

// Nouveaux prompts pour les catégories additionnelles
const additionalPrompts = {
    "Questions comparatives": (keyword) => `Génère 5 questions qui comparent différents aspects de "${keyword}" avec d'autres domaines ou alternatives.`,
    "Questions d'impact sociétal": (keyword) => `Génère 5 questions sur l'impact de "${keyword}" sur la société, la culture et les communautés.`,
    "Questions de perspective future": (keyword) => `Génère 5 questions sur l'évolution future et les perspectives de "${keyword}" dans les 5-10 prochaines années.`,
    "Questions de mise en pratique": (keyword) => `Génère 5 questions sur l'application pratique et la mise en œuvre de "${keyword}" dans différents contextes.`,
    "Questions de contexte historique": (keyword) => `Génère 5 questions sur l'histoire, l'origine et l'évolution de "${keyword}".`,
    "Questions d'éthique et de responsabilité": (keyword) => `Génère 5 questions sur les implications éthiques et les responsabilités liées à "${keyword}".`,
    "Questions de tendances actuelles": (keyword) => `Génère 5 questions sur les tendances actuelles et les développements récents concernant "${keyword}".`,
    "Questions de défis et solutions": (keyword) => `Génère 5 questions sur les principaux défis et les solutions potentielles liés à "${keyword}".`,
    "Questions d'innovation": (keyword) => `Génère 5 questions sur les innovations et les avancées dans le domaine de "${keyword}".`,
    "Questions d'expérience personnelle": (keyword) => `Génère 5 questions sur l'expérience personnelle et le vécu des gens par rapport à "${keyword}".`
};

// Export/Import functions
function exportKeywords() {
    const exportData = keywords.map(k => ({
        value: k.value,
        origin: k.origin,
        parentKeyword: k.parentKeyword,
        smartTags: k.smartTags
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords_export_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function importKeywords(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedKeywords = JSON.parse(e.target.result);
            const newKeywords = importedKeywords.filter(imported =>
                !keywords.some(existing => existing.value === imported.value)
            );

            if (newKeywords.length > 0) {
                keywords.push(...newKeywords);
                saveToLocalStorage();
                refreshKeywordList();
                alert(`${newKeywords.length} nouveaux mots-clés importés avec succès`);
            } else {
                alert('Aucun nouveau mot-clé à importer');
            }
        } catch (error) {
            console.error('Error importing keywords:', error);
            alert('Erreur lors de l\'import des mots-clés. Vérifiez le format du fichier.');
        }
    };
    reader.readAsText(file);
}

function exportQuestions() {
    const exportData = questions.map(q => ({
        question: q.question,
        source: q.source,
        category: q.category,
        keyword: q.keyword
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questions_export_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function importQuestions(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedQuestions = JSON.parse(e.target.result);
            let idCounter = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;

            const newQuestions = importedQuestions.filter(imported =>
                !questions.some(existing => existing.question === imported.question)
            ).map(q => ({
                ...q,
                id: idCounter++
            }));

            if (newQuestions.length > 0) {
                questions.push(...newQuestions);
                saveToLocalStorage();
                refreshQuestionsTable();
                alert(`${newQuestions.length} nouvelles questions importées avec succès`);
            } else {
                alert('Aucune nouvelle question à importer');
            }
        } catch (error) {
            console.error('Error importing questions:', error);
            alert('Erreur lors de l\'import des questions. Vérifiez le format du fichier.');
        }
    };
    reader.readAsText(file);
}

async function generateMissingTags() {
    const btn = document.getElementById('generate-missing-tags-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        // Récupérer tous les tags existants
        const existingTags = new Set(
            keywords.flatMap(k => k.smartTags)
        );

        // Pour chaque mot-clé sans tags
        const keywordsWithoutTags = keywords.filter(k => !k.smartTags || k.smartTags.length === 0);
        let processedCount = 0;

        for (const keyword of keywordsWithoutTags) {
            try {
                const response = await fetch('/api/generateSmartTags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: keyword.value,
                        existingTags: Array.from(existingTags)
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    keyword.smartTags = data.tags;
                    data.tags.forEach(tag => existingTags.add(tag));

                    // Mise à jour progressive
                    processedCount++;
                    btn.textContent = `Génération... (${processedCount}/${keywordsWithoutTags.length})`;

                    // Rafraîchir l'interface après chaque mot-clé traité
                    refreshKeywordList();
                    saveToLocalStorage();
                }
            } catch (error) {
                console.error(`Error generating tags for ${keyword.value}:`, error);
            }

            // Petite pause entre chaque requête pour éviter de surcharger l'API
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        console.error('Error in generateMissingTags:', error);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.textContent = 'Générer tags manquants';
    }
}
