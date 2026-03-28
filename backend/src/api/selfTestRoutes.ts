import { Router, Request, Response } from 'express';
import { aiRouter } from '../services/router/AIRouter';
import { claudeService } from '../services/claude/ClaudeService';
import { promptService } from '../services/prompts/PromptService';
import { logger } from '../utils/logger';

const router = Router();

// ─── Test-Szenarien ────────────────────────────────────────────

export interface TestScenario {
    id: string;
    category: string;
    name: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Die letzte User-Nachricht wird als aktuelle Frage gesendet */
    evaluationCriteria: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
    // ─── SMALLTALK ─────────────────────────────────
    {
        id: 'smalltalk-greeting',
        category: 'Smalltalk',
        name: 'Begruessung',
        messages: [
            { role: 'user', content: 'Hallo, wie geht es dir heute?' }
        ],
        evaluationCriteria: [
            'Antwortet freundlich und menschlich',
            'Kein Code, keine technischen Informationen',
            'Keine Systeminformationen (Gemma, Node.js, etc.)',
            'Antwort ist kurz und natuerlich (unter 100 Woerter)',
        ]
    },
    {
        id: 'smalltalk-daily',
        category: 'Smalltalk',
        name: 'Alltaegliche Erzaehlung',
        messages: [
            { role: 'user', content: 'Meine Mutter ist gerade beim Einkaufen. Ich warte auf sie.' }
        ],
        evaluationCriteria: [
            'Reagiert wie ein Freund — kurz und interessiert',
            'Bietet NICHT ungefragt Code oder technische Hilfe an',
            'Verwechselt nicht wer einkaufen ist (die Mutter, nicht der Nutzer)',
            'Antwort ist nicht zu lang (unter 80 Woerter)',
        ]
    },
    {
        id: 'smalltalk-no-code',
        category: 'Smalltalk',
        name: 'Keine ungewollten Code-Snippets',
        messages: [
            { role: 'user', content: 'Ich hatte heute einen langen Tag. Bin muede.' }
        ],
        evaluationCriteria: [
            'Zeigt Empathie und Verstaendnis',
            'Bietet KEINEN Code oder technische Hilfe an',
            'Keine Erwaehnung von Systemen, Modellen oder Technik',
            'Kurze, warme Antwort',
        ]
    },

    // ─── MEMORY / HALLUZINATION ────────────────────
    {
        id: 'memory-no-hallucination',
        category: 'Memory',
        name: 'Keine erfundenen Fakten',
        messages: [
            { role: 'user', content: 'Was weisst du ueber mich?' }
        ],
        evaluationCriteria: [
            'Erfindet KEINE Fakten ueber den Nutzer',
            'Gibt ehrlich zu wenn wenig gespeichert ist',
            'Nennt nur verifizierbare Informationen',
            'Erwaehnt NICHT ungefragt Dritte (Harry, Max, etc.)',
        ]
    },
    {
        id: 'memory-temporal-ignore',
        category: 'Memory',
        name: 'Temporaere Situation nicht als Fakt',
        messages: [
            { role: 'user', content: 'Meine Schwester ist gerade beim Arzt.' },
            { role: 'assistant', content: 'Oh, ich hoffe es geht ihr gut! Ist alles in Ordnung?' },
            { role: 'user', content: 'Ja alles gut, nur eine Routineuntersuchung. Was weisst du ueber mich?' }
        ],
        evaluationCriteria: [
            'Erwaehnt NICHT "Schwester beim Arzt" als gespeichertes Wissen',
            'Behandelt den Arztbesuch nicht als dauerhaften Fakt',
            'Gibt ehrlich an was ueber den Nutzer bekannt ist',
        ]
    },

    // ─── FOKUS & RELEVANZ ──────────────────────────
    {
        id: 'focus-answer-question',
        category: 'Fokus',
        name: 'Beantwortet die gestellte Frage',
        messages: [
            { role: 'user', content: 'Was ist die Hauptstadt von Frankreich?' }
        ],
        evaluationCriteria: [
            'Antwortet korrekt mit Paris',
            'Schweift nicht ab',
            'Kurze, praezise Antwort',
            'Kein unnoetieger Monolog',
        ]
    },
    {
        id: 'focus-no-system-dump',
        category: 'Fokus',
        name: 'Kein System-Dump bei einfacher Frage',
        messages: [
            { role: 'user', content: 'Wie spaet ist es?' }
        ],
        evaluationCriteria: [
            'Gibt die Zeit an oder sagt dass die aktuelle Uhrzeit nicht verfuegbar ist',
            'Listet NICHT die eigenen Systeme auf',
            'Erwaehnt NICHT Gemma, Node.js, React, etc.',
            'Kurze Antwort',
        ]
    },

    // ─── TONFALL & PERSOENLICHKEIT ─────────────────
    {
        id: 'tone-friendly',
        category: 'Tonfall',
        name: 'Freundlicher Ton',
        messages: [
            { role: 'user', content: 'Kannst du mir helfen, eine Einkaufsliste zu erstellen?' }
        ],
        evaluationCriteria: [
            'Freundlicher, hilfsbereiter Ton',
            'Duzt den Nutzer',
            'Bietet aktiv Hilfe an',
            'Fragt nach Wuenschen/Details',
        ]
    },
    {
        id: 'tone-correction',
        category: 'Tonfall',
        name: 'Reagiert gut auf Korrektur',
        messages: [
            { role: 'user', content: 'Erzaehl mir einen Witz' },
            { role: 'assistant', content: 'Warum koennen Geister so schlecht luegen? Weil man durch sie hindurchsehen kann!' },
            { role: 'user', content: 'Das war nicht lustig. Versuch es nochmal mit einem besseren.' }
        ],
        evaluationCriteria: [
            'Akzeptiert die Kritik ohne beleidigt zu sein',
            'Versucht einen besseren Witz',
            'Bleibt freundlich und locker',
            'Kein defensives Verhalten',
        ]
    },

    // ─── DEUTSCH & SPRACHE ─────────────────────────
    {
        id: 'language-german',
        category: 'Sprache',
        name: 'Antwortet auf Deutsch',
        messages: [
            { role: 'user', content: 'Erklaere mir bitte was ein Algorithmus ist.' }
        ],
        evaluationCriteria: [
            'Antwortet auf Deutsch',
            'Korrekte deutsche Grammatik',
            'Verstaendliche Erklaerung',
            'Keine abgebrochenen Saetze oder Zeichensalat',
        ]
    },
];

// ─── Evaluator ─────────────────────────────────────────────────

interface TestResult {
    scenario: TestScenario;
    neonResponse: string;
    provider: string;
    model: string;
    evaluation: {
        score: number;          // 0-10
        passed: boolean;        // score >= 7
        criteriaResults: Array<{
            criterion: string;
            passed: boolean;
            comment: string;
        }>;
        overallComment: string;
        suggestions: string[];  // Verbesserungsvorschlaege
    };
    durationMs: number;
}

async function evaluateResponse(
    scenario: TestScenario,
    neonResponse: string
): Promise<TestResult['evaluation']> {
    const evaluationPrompt = `Du bist ein strenger Qualitaetstester fuer einen KI-Assistenten namens "NEON".
Analysiere die folgende Antwort von NEON und bewerte sie anhand der Kriterien.

WICHTIG: Sei STRENG aber FAIR. Denke LAENGER nach bevor du bewertest.
Analysiere jedes Kriterium einzeln und gruendlich.

TEST-SZENARIO: "${scenario.name}" (Kategorie: ${scenario.category})

KONVERSATION:
${scenario.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

NEON's ANTWORT:
${neonResponse}

BEWERTUNGSKRITERIEN:
${scenario.evaluationCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Bewerte JEDES Kriterium einzeln. Antworte als JSON:
{
  "score": <0-10 Gesamtnote>,
  "criteriaResults": [
    {
      "criterion": "<Kriterium>",
      "passed": <true/false>,
      "comment": "<Kurze Begruendung>"
    }
  ],
  "overallComment": "<Zusammenfassung in 1-2 Saetzen>",
  "suggestions": ["<Konkreter Verbesserungsvorschlag 1>", "<Vorschlag 2>"]
}

NUR das JSON ausgeben, kein weiterer Text.`;

    try {
        const response = await claudeService.sendMessage(
            evaluationPrompt,
            [],
            'Du bist ein Qualitaetstester. Bewerte KI-Antworten streng und fair. Antworte NUR als JSON.'
        );

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return {
                score: 0,
                passed: false,
                criteriaResults: [],
                overallComment: 'Evaluierung fehlgeschlagen: Kein JSON in der Antwort',
                suggestions: [],
            };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            score: parsed.score || 0,
            passed: (parsed.score || 0) >= 7,
            criteriaResults: parsed.criteriaResults || [],
            overallComment: parsed.overallComment || '',
            suggestions: parsed.suggestions || [],
        };
    } catch (error) {
        logger.error('[SelfTest] Evaluation failed:', error);
        return {
            score: 0,
            passed: false,
            criteriaResults: [],
            overallComment: `Evaluierung fehlgeschlagen: ${error}`,
            suggestions: [],
        };
    }
}

// ─── Routes ────────────────────────────────────────────────────

/** Liste aller verfuegbaren Test-Szenarien */
router.get('/scenarios', (_req: Request, res: Response) => {
    const scenarios = TEST_SCENARIOS.map(s => ({
        id: s.id,
        category: s.category,
        name: s.name,
        criteriaCount: s.evaluationCriteria.length,
    }));
    res.json({ scenarios });
});

/** Einzelnen Test ausfuehren */
router.post('/run/:scenarioId', async (req: Request, res: Response) => {
    const { scenarioId } = req.params;
    const scenario = TEST_SCENARIOS.find(s => s.id === scenarioId);

    if (!scenario) {
        res.status(404).json({ error: `Szenario '${scenarioId}' nicht gefunden` });
        return;
    }

    try {
        logger.info(`[SelfTest] Running scenario: ${scenario.name}`);
        const startTime = Date.now();

        // Baue System-Prompt wie im normalen Chat
        const systemPrompt = promptService.buildSystemPrompt({ personality: 'freundlich' });

        // Die letzte User-Nachricht ist die aktuelle Frage
        const history = scenario.messages.slice(0, -1).map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));
        const currentMessage = scenario.messages[scenario.messages.length - 1].content;

        // Sende an NEON's AI Router (gleicher Weg wie im Chat)
        const aiResponse = await aiRouter.route(
            currentMessage,
            history,
            undefined,
            systemPrompt
        );

        const durationMs = Date.now() - startTime;

        // Claude evaluiert die Antwort
        const evaluation = await evaluateResponse(scenario, aiResponse.content);

        const result: TestResult = {
            scenario,
            neonResponse: aiResponse.content,
            provider: aiResponse.provider,
            model: aiResponse.model,
            evaluation,
            durationMs,
        };

        logger.info(`[SelfTest] ${scenario.name}: ${evaluation.score}/10 (${evaluation.passed ? 'PASSED' : 'FAILED'})`);
        res.json(result);
    } catch (error) {
        logger.error(`[SelfTest] Failed to run scenario ${scenarioId}:`, error);
        res.status(500).json({ error: `Test fehlgeschlagen: ${error}` });
    }
});

/** Alle Tests ausfuehren */
router.post('/run-all', async (_req: Request, res: Response) => {
    logger.info(`[SelfTest] Running all ${TEST_SCENARIOS.length} scenarios...`);
    const results: TestResult[] = [];

    for (const scenario of TEST_SCENARIOS) {
        try {
            const startTime = Date.now();

            const systemPrompt = promptService.buildSystemPrompt({ personality: 'freundlich' });
            const history = scenario.messages.slice(0, -1).map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));
            const currentMessage = scenario.messages[scenario.messages.length - 1].content;

            const aiResponse = await aiRouter.route(
                currentMessage,
                history,
                undefined,
                systemPrompt
            );

            const durationMs = Date.now() - startTime;
            const evaluation = await evaluateResponse(scenario, aiResponse.content);

            results.push({
                scenario,
                neonResponse: aiResponse.content,
                provider: aiResponse.provider,
                model: aiResponse.model,
                evaluation,
                durationMs,
            });

            logger.info(`[SelfTest] ${scenario.name}: ${evaluation.score}/10`);
        } catch (error) {
            logger.error(`[SelfTest] Scenario ${scenario.id} failed:`, error);
            results.push({
                scenario,
                neonResponse: '',
                provider: 'error',
                model: 'error',
                evaluation: {
                    score: 0,
                    passed: false,
                    criteriaResults: [],
                    overallComment: `Fehler: ${error}`,
                    suggestions: [],
                },
                durationMs: 0,
            });
        }
    }

    // Gesamtbericht
    const passed = results.filter(r => r.evaluation.passed).length;
    const failed = results.filter(r => !r.evaluation.passed).length;
    const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.evaluation.score, 0) / results.length
        : 0;

    // Alle Suggestions sammeln
    const allSuggestions = results
        .flatMap(r => r.evaluation.suggestions)
        .filter((s, i, arr) => arr.indexOf(s) === i); // Deduplizieren

    const report = {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed,
        failed,
        averageScore: Math.round(avgScore * 10) / 10,
        results,
        allSuggestions,
    };

    logger.info(`[SelfTest] Complete: ${passed}/${results.length} passed, avg score: ${avgScore.toFixed(1)}/10`);
    res.json(report);
});

export { router as selfTestRoutes };
