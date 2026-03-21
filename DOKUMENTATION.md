# Neon AI Assistant – Dokumentation

## Übersicht

**Neon AI Assistant** ist ein lokal betriebener Desktop-KI-Assistent mit einem intelligenten Hybrid-Routing-System zwischen Cloud-KI (Claude) und lokaler KI (Ollama). Das System verfügt über ein mehrstufiges Gedächtnissystem, Sprachsteuerung, proaktive Benachrichtigungen und ein erweiterbares Plugin-System.

---

## Technologie-Stack

| Bereich     | Technologie                                        |
|-------------|----------------------------------------------------|
| Desktop     | Electron (rahmenloses Fenster, 1200×800 Standard)  |
| Frontend    | React 18, TypeScript, Vite, Tailwind CSS           |
| Animationen | Framer Motion                                      |
| State       | Zustand                                            |
| Backend     | Node.js, Express, TypeScript                       |
| Echtzeit    | Socket.io (WebSocket)                              |
| Datenbank   | SQLite (lokal) / PostgreSQL (Produktion)           |
| ORM         | Prisma                                             |
| Vektor-DB   | ChromaDB (mit JSON-Fallback)                       |
| Cloud-KI    | Anthropic Claude (claude-sonnet-4-5)               |
| Lokale KI   | Ollama mit Gemma 3 4B                              |
| Embeddings  | Transformers.js (lokal, keine API)                 |
| Sicherheit  | Helmet, CORS, Rate Limiting                        |
| Logging     | Winston                                            |

---

## Ordnerstruktur

```
neon-ai-assistant/
├── backend/                    ← Node.js/Express Backend
│   ├── src/
│   │   ├── index.ts            ← Server-Einstiegspunkt
│   │   ├── api/                ← REST-Routen & WebSocket-Handler
│   │   │   ├── routes.ts
│   │   │   ├── websocket.ts
│   │   │   ├── memoryRoutes.ts
│   │   │   ├── adminRoutes.ts
│   │   │   ├── skillRoutes.ts
│   │   │   ├── settingsRoutes.ts
│   │   │   ├── uploadRoutes.ts
│   │   │   ├── proactiveRoutes.ts
│   │   │   ├── magicRoutes.ts
│   │   │   └── voice.ts
│   │   └── services/           ← Geschäftslogik (35+ Services)
│   │       ├── router/         ← KI-Routing (Claude vs. Ollama)
│   │       ├── claude/         ← Claude-Integration
│   │       ├── ollama/         ← Ollama-Integration
│   │       ├── memory/         ← 5-Schichten-Gedächtnissystem
│   │       ├── search/         ← Semantische Suche
│   │       ├── embeddings/     ← Vektor-Generierung
│   │       ├── chroma/         ← ChromaDB-Schnittstelle
│   │       ├── db/             ← Datenbank-Services
│   │       ├── learning/       ← Lernmodus & Persönlichkeit
│   │       ├── magic/          ← Erweiterte Features
│   │       ├── proactive/      ← Proaktive KI
│   │       ├── skills/         ← Skill-Verarbeitung
│   │       ├── guardrails/     ← Inhaltsfilter
│   │       ├── execution/      ← Code-Ausführung
│   │       └── web/            ← Websuche
│   ├── prisma/
│   │   ├── schema.prisma       ← Datenbankschema (16 Tabellen)
│   │   └── migrations/
│   └── package.json
│
├── frontend/                   ← Electron + React Frontend
│   ├── src/
│   │   ├── main/index.ts       ← Electron Hauptprozess
│   │   ├── preload/index.ts    ← IPC-Bridge (Sicherheit)
│   │   └── renderer/          ← React-App
│   │       ├── App.tsx
│   │       ├── components/    ← 21+ UI-Komponenten
│   │       ├── store/         ← Zustand State-Management
│   │       └── services/      ← Frontend-Services
│   └── public/                ← Logos, Icons (ICO/PNG/SVG)
│
├── shared/types/               ← Geteilte TypeScript-Typen
├── scripts/                    ← Hilfsskripte
├── logs/                       ← Anwendungs-Logs
└── memory/                     ← Memory-Cache-Speicher
```

---

## KI-Routing-System (5-Stufen-Orchestrator)

Das Herzstück des Assistenten ist ein intelligentes Routing-System, das automatisch entscheidet, welche KI die beste Antwort liefert.

```
Nachricht eingehend
        ↓
Stufe 1: Domain-Klassifizierung
        ↓
  Emotional / Persönlich / Gespräch → Ollama (Identität erhalten)
  Code / Planung / Wissen / Analyse → Weiter zu Stufe 2
        ↓
Stufe 2: Komplexitätsbewertung (0–100)
        ↓
Stufe 3: Selbstvertrauen-Analyse von Ollama (0–1)
        ↓
Stufe 4: Tiefenschwellwert prüfen
        ↓
  Tiefe > 0.85 → Claude (Qualität)
  Tiefe < 0.85 → Ollama (Geschwindigkeit/Privatsphäre)
        ↓
Stufe 5: Ausführung (optional: Hybrid-Modus)
```

**Konfiguration (`.env`):**
```env
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70
```

---

## 5-Schichten-Gedächtnissystem

```
Arbeitsgedächtnis      (Working Memory)    1–4 Stunden
        ↓ Konsolidierung
Kurzzeitgedächtnis     (Short-Term)        1–7 Tage
        ↓ Extraktion + Bewertung
Langzeitgedächtnis     (Long-Term)         Permanent
Episodisches Gedächtnis (Episodic)         Zeitgebundene Ereignisse
Semantisches Gedächtnis (Semantic)        Strukturiertes Wissen
```

**Wichtigkeits-Scoring:**
- Schlüsselwörter: „wichtig", „merke", „remember" → erhöhte Priorität
- Inhaltslänge & Komplexität
- Code-Blöcke oder Fragen vorhanden
- Nutzer-Feedback
- Zugriffshäufigkeit

**Kontext-Aufbau:**
- Relevante Erinnerungen werden anhand der Anfrage abgerufen
- Ranking nach Wichtigkeit & Aktualität
- Kontextfenster bis zu 5000+ Tokens

---

## WebSocket-Events

| Event                  | Richtung         | Beschreibung                    |
|------------------------|------------------|---------------------------------|
| `user-message`         | Client → Server  | Nachricht senden                |
| `ai-response-chunk`    | Server → Client  | Antwort-Stream (Token für Token)|
| `ai-response-complete` | Server → Client  | Antwort vollständig             |
| `conversations-list`   | Server → Client  | Gesprächsliste synchronisieren  |
| `typing-indicator`     | Server → Client  | Tipp-Status                     |

---

## REST-API Endpunkte

| Bereich         | Basis-Route       | Beschreibung                  |
|-----------------|-------------------|-------------------------------|
| Gesundheit      | `/api/health`     | System-Status                 |
| Gespräche       | `/api/conversations` | CRUD für Chats             |
| Gedächtnis      | `/api/memory`     | Gedächtnissystem-Operationen  |
| Suche           | `/api/search`     | Semantische Suche             |
| Einstellungen   | `/api/settings`   | Benutzereinstellungen         |
| Skills          | `/api/skills`     | Skill-Verwaltung              |
| Admin           | `/api/admin`      | Admin-Operationen             |
| Sprache         | `/api/voice`      | Spracheingabe/-ausgabe        |
| Proaktiv        | `/api/proactive`  | Proaktive Benachrichtigungen  |

---

## UI-Komponenten

| Komponente               | Beschreibung                                        |
|--------------------------|-----------------------------------------------------|
| `ChatInterface`          | Haupt-Chat mit Nachrichtenverlauf                   |
| `MessageBubble`          | Einzelne Nachrichten mit Markdown & Syntax-Highlighting |
| `ChatInput`              | Auto-Expanding Eingabe mit Emoji & Anhängen         |
| `SemanticSearch`         | Suche in alten Gesprächen (Strg+K)                  |
| `MemoryDashboard`        | Gedächtnis visualisieren & verwalten                |
| `AdminPanel`             | Dokumente importieren, Neuindizierung               |
| `SettingsPanel`          | KI-Routing, Datenschutz, Darstellung konfigurieren  |
| `SkillStore`             | Skills durchsuchen & verwalten                      |
| `VoiceControls`          | Spracheingabe & TTS-Ausgabe                         |
| `ProactiveNotifications` | KI-Vorschläge & Erinnerungen                        |
| `EmotionDashboard`       | Emotions-Tracking & Analyse                         |
| `InterviewDashboard`     | Interview-/Lernsitzungen                            |
| `PredictiveAssistant`    | ML-basierte Aktionsvorschläge                       |
| `WelcomeScreen`          | Begrüßungsbildschirm beim ersten Start              |
| `WeatherCard`            | Wetter-Widget (über Skill)                          |

---

## Datenbank-Schema (16 Tabellen)

| Tabelle               | Beschreibung                          |
|-----------------------|---------------------------------------|
| `users`               | Benutzerprofile                       |
| `conversations`       | Chat-Sitzungen                        |
| `messages`            | Einzelne Nachrichten                  |
| `memory_entries`      | Langzeitige Erinnerungen              |
| `episodes`            | Zeitgebundene Ereignisse              |
| `knowledge_entries`   | Semantisches Wissen                   |
| `memory_embeddings`   | Vektor-Embeddings                     |
| `memory_tags`         | Gedächtnis-Kategorisierung            |
| `memory_relations`    | Wissensgraph                          |
| `memory_extractions`  | Extraktions-Protokoll                 |
| `user_preferences`    | Benutzereinstellungen                 |
| `api_usage`           | Token-Verbrauchstracking              |
| `documents`           | Hochgeladene Dokumente                |
| `feedback`            | Nutzer-Feedback                       |
| `proactive_messages`  | Vorschläge & Erinnerungen             |
| `plugins`             | Plugin-Register                       |
| `learning_sessions`   | Interview-/Lernverlauf                |
| `emotion_logs`        | Emotions-Tracking                     |
| `time_capsules`       | Zeitverzögerte Nachrichten            |

---

## Konfiguration (.env)

```env
# KI-Dienste
ANTHROPIC_API_KEY=sk-ant-api03-...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b

# Datenbank
DATABASE_URL=file:./prisma/neon.db

# Server
NODE_ENV=development
PORT=3001
ENCRYPTION_KEY=<32-Zeichen-Schlüssel>

# KI-Router
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70
```

---

## Start & Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Datenbank initialisieren
npm run prisma:generate
npm run prisma:migrate

# Entwicklung starten (Frontend + Backend gleichzeitig)
npm run dev

# Nur Backend
cd backend && npm run dev

# Nur Frontend
cd frontend && npm run dev

# Produktions-Build
npm run build
```

**Voraussetzungen:**
- Node.js 20+
- Ollama installiert & gestartet (`ollama serve`)
- Ollama-Modell geladen: `ollama pull gemma3:4b`
- Anthropic API-Key (optional, für Claude-Features)

---

## Implementierte Phasen (alle 17)

| Phase | Feature                          | Status |
|-------|----------------------------------|--------|
| 0–3   | Desktop-App, Chat, Markdown      | ✅     |
| 4     | Hybrides KI-Routing              | ✅     |
| 5     | Semantische Suche (ChromaDB)     | ✅     |
| 6     | 5-Schichten-Gedächtnis           | ✅     |
| 7     | Admin-Panel, Dokument-Import     | ✅     |
| 8     | Spracheingabe & TTS              | ✅     |
| 9     | Proaktive KI                     | ✅     |
| 10    | Lernmodus & Interview            | ✅     |
| 11    | Einstellungen                    | ✅     |
| 12    | Plugin-System                    | ✅     |
| 13    | Emotions-Tracking                | ✅     |
| 14    | Prädiktive Vorschläge            | ✅     |
| 15    | Zeitkapseln                      | ✅     |
| 16    | Code-Ausführung, Guardrails      | ✅     |
| 17    | Websuche, Vision, Währung        | ✅     |

---

*Neon AI Assistant · Dokumentation v1.0*
