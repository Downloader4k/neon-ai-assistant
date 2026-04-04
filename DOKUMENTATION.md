# Neon AI Assistant - Dokumentation

## Uebersicht

**NEON** ist ein persoenlicher Hybrid-KI-Assistent als Web-App mit intelligentem Routing zwischen Cloud-KI (Claude) und lokaler KI (Ollama), 5-Schichten-Gedaechtnissystem, Sprachein-/ausgabe, Todo-/Einkaufs-/Kalenderverwaltung und 30+ Features.

---

## Technologie-Stack

| Bereich | Technologie |
|---------|------------|
| Backend | Node.js, Express, TypeScript |
| Frontend | React 18, Vite, Tailwind CSS |
| State | Zustand |
| Echtzeit | Socket.io (WebSocket) |
| Datenbank | SQLite (Prisma ORM) |
| Vektor-DB | ChromaDB + sqlite-vec |
| Cloud-KI | Anthropic Claude API |
| Lokale KI | Ollama (Gemma3, Llama, etc.) |
| Embeddings | Transformers.js (lokal) |
| TTS | Microsoft Edge TTS (msedge-tts) |
| STT | faster-whisper (Python) + Web Speech API |
| Animationen | Framer Motion |
| Sicherheit | Helmet, CORS, Rate Limiting |
| Logging | Winston |

---

## Ordnerstruktur

```
neon-ai-assistant/
├── backend/
│   ├── src/
│   │   ├── index.ts                ← Server-Einstiegspunkt
│   │   ├── api/                    ← REST-Routen & WebSocket
│   │   │   ├── routes.ts           ← Haupt-Router
│   │   │   ├── websocket.ts        ← Socket.io Handler
│   │   │   ├── todoRoutes.ts       ← Todo REST API
│   │   │   ├── shoppingRoutes.ts   ← Einkaufs REST API
│   │   │   ├── calendarRoutes.ts   ← Kalender REST API
│   │   │   ├── memoryRoutes.ts     ← Gedaechtnis API
│   │   │   ├── adminRoutes.ts      ← Admin API
│   │   │   ├── voice.ts            ← TTS/STT API
│   │   │   ├── learningRoutes.ts   ← Lernmodus API
│   │   │   ├── skillStoreRoutes.ts ← Skill Store API
│   │   │   └── ...
│   │   └── services/               ← Geschaeftslogik
│   │       ├── router/             ← KI-Routing (5-Stufen)
│   │       │   ├── AIRouter.ts     ← Haupt-Router
│   │       │   ├── BanditSelector.ts ← UCB1 Lern-Algorithmus
│   │       │   └── RoutingLogger.ts  ← Routing-Protokoll
│   │       ├── claude/             ← Claude API Service
│   │       ├── ollama/             ← Ollama Service
│   │       ├── memory/             ← 5-Schichten-Gedaechtnis
│   │       ├── search/             ← Semantische Suche
│   │       ├── embeddings/         ← Vektor-Generierung
│   │       ├── skills/             ← Skill Processor + Registry
│   │       │   ├── SkillProcessor.ts  ← Slash-Command Verarbeitung
│   │       │   ├── SkillRegistry.ts   ← Plugin-Verwaltung
│   │       │   └── SkillManifest.ts   ← Manifest-Parser
│   │       ├── voice/              ← Sprach-Services
│   │       │   ├── TTSService.ts   ← Text-to-Speech (Edge TTS)
│   │       │   └── STTService.ts   ← Speech-to-Text (Whisper)
│   │       ├── db/                 ← Datenbank-Services
│   │       │   ├── prisma.ts       ← Prisma Client
│   │       │   ├── todoService.ts  ← Todo CRUD + KI-Kategorisierung
│   │       │   ├── shoppingService.ts ← Einkauf CRUD + KI-Sortierung
│   │       │   ├── calendarService.ts ← Kalender CRUD + KI-Kategorisierung + Datum-Parser
│   │       │   ├── userService.ts  ← Benutzer-Verwaltung
│   │       │   └── ...
│   │       ├── magic/              ← Spezial-Features
│   │       ├── learning/           ← Lernmodus & Persoenlichkeit
│   │       ├── proactive/          ← Proaktive Nachrichten
│   │       ├── execution/          ← Code-Ausfuehrung (Sandbox)
│   │       ├── web/                ← Web-Suche, Scraping
│   │       ├── guardrails/         ← Inhaltsfilter
│   │       └── vision/             ← Bild-Analyse
│   ├── prisma/
│   │   ├── schema.prisma           ← Datenbankschema
│   │   └── migrations/
│   ├── scripts/
│   │   └── whisper_transcribe.py   ← faster-whisper STT
│   └── package.json
│
├── frontend/
│   ├── src/renderer/               ← React-App
│   │   ├── App.tsx                 ← Haupt-Komponente
│   │   ├── components/             ← 40+ UI-Komponenten
│   │   │   ├── ChatInterface.tsx   ← Chat mit Nachrichtenverlauf
│   │   │   ├── ChatInput.tsx       ← Eingabe mit Slash-Commands
│   │   │   ├── WelcomeScreen.tsx   ← Startseite mit Slash-Commands
│   │   │   ├── ListManager.tsx     ← Todos & Einkaufslisten UI
│   │   │   ├── CalendarView.tsx   ← Kalender (Monats- & Listenansicht)
│   │   │   ├── VoiceChatModal.tsx  ← Voice Chat Popup
│   │   │   ├── VoiceControls.tsx   ← Stimmenauswahl + TTS
│   │   │   ├── DiscoverPage.tsx    ← Entdecken-Seite
│   │   │   ├── MemoryInspector.tsx ← Gedaechtnis-Visualisierung
│   │   │   ├── SkillMarketplace.tsx ← Skill Store UI
│   │   │   ├── AdminPanel.tsx      ← Admin-Dashboard
│   │   │   ├── MorningBriefing.tsx ← Morgenbriefing
│   │   │   ├── ChallengeMode.tsx   ← Raetsel & Challenges
│   │   │   ├── AIDiary.tsx         ← KI-Tagebuch
│   │   │   ├── SecretNotes.tsx     ← Verschluesselte Notizen
│   │   │   ├── ThoughtTimeline.tsx ← Gedanken-Zeitstrahl
│   │   │   ├── PersonalityRadar.tsx ← Interessen-Radar
│   │   │   ├── CanvasBoard.tsx     ← Whiteboard
│   │   │   ├── TimeCapsules.tsx    ← Zeitkapseln
│   │   │   ├── CodeExecutor.tsx    ← Code-Ausfuehrung UI
│   │   │   ├── LocalRAG.tsx        ← Dokument-Suche
│   │   │   └── ...
│   │   ├── store/
│   │   │   └── useAppStore.ts      ← Zustand State Management
│   │   ├── services/
│   │   │   ├── AudioPlaybackService.ts ← Audio-Wiedergabe
│   │   │   └── AudioStreamService.ts   ← Audio-Streaming
│   │   └── index.css
│   └── public/
│
├── docs/                           ← Test-Anleitungen
├── package.json                    ← Workspace Root
└── README.md
```

---

## KI-Routing-System (5-Stufen-Orchestrator)

Intelligentes Routing entscheidet automatisch welche KI die beste Antwort liefert:

```
Nachricht eingehend
        |
Stufe 1: Domain-Klassifizierung
        |
  Emotional / Gespraech  → Ollama (Identitaet erhalten)
  Code / Analyse / Wissen → Weiter zu Stufe 2
        |
Stufe 2: Komplexitaetsbewertung (0-100)
        |
Stufe 3: Selbstvertrauen-Analyse von Ollama (0-1)
        |
Stufe 4: Tiefenschwellwert pruefen
        |
  Tiefe > 0.85 → Claude (Qualitaet)
  Tiefe < 0.85 → Ollama (Geschwindigkeit/Privatsphaere)
        |
Stufe 5: Ausfuehrung + Streaming
```

### Lernender Orchestrator (UCB1)

Der `BanditSelector` nutzt den UCB1-Algorithmus um aus Nutzer-Feedback zu lernen:
- Protokolliert welches Modell fuer welches Thema gewaehlt wurde
- Lernt aus positiven/negativen Bewertungen
- Verbessert Modell-Auswahl ueber Zeit

**Konfiguration (.env):**
```env
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70
```

---

## 5-Schichten-Gedaechtnissystem

| Schicht | Lebensdauer | Zweck |
|---------|-------------|-------|
| **Working Memory** | 1-4 Stunden | Aktive Session, aktueller Kontext |
| **Short-Term** | 1-7 Tage | Kuerzliche Informationen |
| **Long-Term** | Permanent | Wichtige Fakten ueber den Nutzer |
| **Episodic** | Variabel | Zeitgebundene Ereignisse |
| **Semantic** | Permanent | Strukturiertes Wissen |

**Importance Scoring** basiert auf:
- Schluesselwoerter ("wichtig", "merke", "remember")
- Inhaltskomplexitaet und -laenge
- Code-Bloecke oder Fragen
- Nutzer-Feedback und Zugriffshaeufigkeit

**Memory Decay**: Erinnerungen verlieren Staerke ueber Zeit (konfigurierbare Halbwertszeiten). Automatische Konsolidierung promotet wichtige Eintraege in hoehere Schichten.

---

## Slash-Commands & Skill Processor

Der `SkillProcessor` faengt Nachrichten mit `/`-Prefix ab und verarbeitet sie bevor die KI antwortet:

| Command | Verarbeitung | Ergebnis |
|---------|-------------|----------|
| `/todo [text]` | todoService.create() + aiCategorize() | Todo mit Kategorie + Prioritaet |
| `/todos` | todoService.getAll() + getStats() | Liste aller offenen Todos |
| `/todo done [text]` | todoService.complete() | Todo als erledigt markiert |
| `/todo delete [text]` | todoService.delete() | Todo geloescht |
| `/einkauf [items]` | shoppingService.addItems() + aiCategorize() | Artikel mit Kategorie + Laden |
| `/einkaufsliste` | shoppingService.getItems() | Gruppiert nach Kategorie |
| `/einkauf done [item]` | shoppingService.togglePurchased() | Artikel abgehakt |
| `/einkauf clear` | shoppingService.clearPurchased() | Gekaufte entfernt |
| `/wetter [stadt]` | weatherService.getWeather() | Wetterdaten als Kontext |
| `/termin [text]` | calendarService.create() + aiCategorize() | Termin mit Kategorie + Farbe |
| `/termine` | calendarService.getUpcoming() | Naechste 14 Tage Termine |
| `/kalender` | Navigation | Kalender-Seite oeffnen |
| `/termin delete [text]` | calendarService.delete() | Termin loeschen |

**KI-Kategorisierung**: Keyword-basierte Zuordnung ohne API-Call:
- Todos → Arbeit, Haushalt, Gesundheit, Finanzen, Bildung, Technik, Freizeit, etc.
- Prioritaet → urgent, high, medium, low (anhand von Schluesselwoertern)
- Einkauf → Obst & Gemuese, Milchprodukte, Fleisch, Backwaren, Hygiene, etc.
- Laeden → Supermarkt, DM, Baumarkt (anhand der Kategorie)
- Kalender → Arbeit (blau), Gesundheit (rot), Sport (gruen), Feier (orange), Bildung (lila), Erledigung (braun), Freizeit (pink), Persoenlich (cyan)
- Datum-Parser → "heute", "morgen", Wochentage, "am 5. April", "14 Uhr", "halb 3"

---

## Voice / Sprache

### Text-to-Speech (TTS)

- **Backend**: Microsoft Edge TTS (msedge-tts) mit 30+ neuronalen Stimmen
- **cleanTextForTTS()**: Entfernt Emojis, CJK-Zeichen, Markdown, URLs vor Synthese
- **Endpoint**: `POST /api/voice/tts/synthesize` → Audio-Stream
- **Stimmen-Endpoint**: `GET /api/voice/tts/voices` → Liste aller Stimmen

### Speech-to-Text (STT)

- **Primary**: faster-whisper (Python, lokales Whisper-Modell)
- **Fallback**: Web Speech API (Browser-basiert)
- **Walkie-Talkie-Modus**: Text wird akkumuliert bis Nutzer den Button nochmal drueckt

### Voice Chat Modal

Dediziertes Popup mit:
- Grosser Mikrofon-Button mit CSS-Pulse-Animation
- Stimmen-Dropdown mit Vorhoer-Buttons
- TTS-Toggle
- Nachrichtenverlauf
- Chunk-Streaming ueber `streamingBufferRef`

---

## Datenbank-Schema

### Kern-Tabellen

| Tabelle | Beschreibung |
|---------|-------------|
| `User` | Benutzerprofile (ID, Name, Avatar) |
| `Conversation` | Chat-Sitzungen |
| `Message` | Einzelne Nachrichten (Rolle, Inhalt, Modell) |
| `MemoryEntry` | Langzeit-Erinnerungen (Typ, Wichtigkeit, Decay) |
| `Episode` | Zeitgebundene Ereignisse |
| `KnowledgeEntry` | Semantisches Wissen |
| `UserPreference` | Benutzereinstellungen (Key-Value) |
| `ApiUsage` | Token-Verbrauch pro Provider |

### Neue Tabellen (Todos, Einkauf & Kalender)

| Tabelle | Felder |
|---------|--------|
| `TodoItem` | id, userId, title, description, category, priority, status, dueDate, completedAt, aiCategorized |
| `ShoppingItem` | id, userId, name, quantity, category, store, isPurchased, listId, aiSorted |
| `ShoppingList` | id, userId, name, store, items (Relation) |
| `CalendarEvent` | id, userId, title, description, startDate, endDate, location, category, color, isAllDay |

### Weitere Tabellen

| Tabelle | Beschreibung |
|---------|-------------|
| `MemoryEmbedding` | Vektor-Embeddings |
| `MemoryTag` | Gedaechtnis-Tags |
| `MemoryRelation` | Wissensgraph-Relationen |
| `MemoryExtraction` | Extraktions-Protokoll |
| `Document` | Hochgeladene Dokumente (RAG) |
| `Feedback` | Nutzer-Bewertungen |
| `ProactiveMessage` | Proaktive Vorschlaege |
| `Plugin` | Plugin-Register |
| `LearningSession` | Lernmodus-Verlauf |
| `EmotionLog` | Emotions-Tracking |
| `TimeCapsule` | Zeitkapseln |

---

## REST-API Endpunkte

### Kern-API

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/health` | GET | System-Status, Uptime, Memory |
| `/api/search?q=...` | GET | Semantische Suche |
| `/api/code/execute` | POST | Code ausfuehren (JS/Python/PS) |

### Todos

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/todos/:userId` | GET | Alle Todos (Filter: status, category) |
| `/api/todos/:userId/stats` | GET | Statistiken (offen, erledigt, ueberfaellig) |
| `/api/todos/:userId/categories` | GET | Verwendete Kategorien |
| `/api/todos` | POST | Neues Todo (mit Auto-Kategorisierung) |
| `/api/todos/:id` | PATCH | Todo aktualisieren |
| `/api/todos/:id/complete` | PATCH | Als erledigt markieren |
| `/api/todos/:id/reopen` | PATCH | Wieder oeffnen |
| `/api/todos/:id` | DELETE | Loeschen |

### Einkaufslisten

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/shopping/:userId` | GET | Alle Artikel (Filter: isPurchased, store, category) |
| `/api/shopping/:userId/stores` | GET | Alle Laeden |
| `/api/shopping/:userId/categories` | GET | Alle Kategorien |
| `/api/shopping/:userId/lists` | GET | Alle Einkaufslisten |
| `/api/shopping/item` | POST | Einzelnes Item |
| `/api/shopping/items` | POST | Batch (Komma-getrennt) |
| `/api/shopping/list` | POST | Neue Liste erstellen |
| `/api/shopping/item/:id/toggle` | PATCH | Gekauft umschalten |
| `/api/shopping/item/:id` | DELETE | Item loeschen |
| `/api/shopping/:userId/purchased` | DELETE | Alle gekauften entfernen |

### Voice

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/voice/tts/voices` | GET | Verfuegbare Stimmen |
| `/api/voice/tts/synthesize` | POST | Text-to-Speech |
| `/api/voice/tts/voice` | POST | Stimme wechseln |
| `/api/voice/status` | GET | Backend, aktuelle Stimme |
| `/api/voice/stt/transcribe` | POST | Speech-to-Text |

### Kalender

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/calendar/:userId` | GET | Alle Termine (Filter: category) |
| `/api/calendar/:userId/range` | GET | Termine nach Zeitraum (startDate, endDate) |
| `/api/calendar/:userId/upcoming` | GET | Naechste Termine (Parameter: days) |
| `/api/calendar/:userId/stats` | GET | Statistiken (heute, Woche, gesamt) |
| `/api/calendar/:userId/categories` | GET | Verwendete Kategorien |
| `/api/calendar` | POST | Neuer Termin (mit Auto-Kategorisierung) |
| `/api/calendar/:id` | PATCH | Termin aktualisieren |
| `/api/calendar/:id` | DELETE | Termin loeschen |

### Weitere

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/memory/*` | * | Gedaechtnis-Operationen |
| `/api/profiles` | * | Benutzerprofile CRUD |
| `/api/settings/*` | * | Einstellungen |
| `/api/admin/*` | * | Admin (Stats, Usage, Performance) |
| `/api/rag/*` | * | Dokument-Import und -Suche |
| `/api/skill-store/*` | * | Skill Marketplace |
| `/api/learning/*` | * | Lernmodus |
| `/api/proactive/*` | * | Proaktive Nachrichten |
| `/api/magic/*` | * | Zeitkapseln, Challenges, etc. |

---

## WebSocket-Events

| Event | Richtung | Beschreibung |
|-------|----------|-------------|
| `user-message` | Client → Server | Nachricht senden (message, userId, personality) |
| `ai-response-chunk` | Server → Client | Streaming-Token mit Provider-Info |
| `ai-response-complete` | Server → Client | Antwort fertig (conversationId) |
| `typing-indicator` | Server → Client | KI denkt nach |
| `conversations-list` | Server → Client | Gespraechsliste synchronisieren |
| `conversation-updated` | Server → Client | Titel/Inhalt aktualisiert |
| `conversation-data` | Server → Client | Komplette Konversation laden |
| `register-user` | Client → Server | Benutzer fuer Notifications registrieren |

---

## UI-Komponenten

### Kern-Komponenten

| Komponente | Beschreibung |
|------------|-------------|
| `App.tsx` | Haupt-Layout: Sidebar + Content, ViewMode-Routing |
| `ChatInterface` | Chat mit Nachrichtenverlauf und Streaming |
| `ChatInput` | Eingabe mit Slash-Commands, Emoji-Picker, Datei-Upload |
| `WelcomeScreen` | Startseite mit Begruessung, Slash-Commands, Quick-Start |
| `ListManager` | Todos & Einkaufslisten (Tabs, Filter, Kategorien) |
| `CalendarView` | Kalender mit Monats-Grid, Listenansicht, CRUD, Kategorie-Filter |
| `VoiceChatModal` | Voice Chat Popup (Walkie-Talkie, Stimmenauswahl) |
| `VoiceControls` | TTS-Toggle und Stimmenauswahl im Chat |

### Feature-Komponenten

| Komponente | Beschreibung |
|------------|-------------|
| `DiscoverPage` | Entdecken-Seite mit Quick-Start-Prompts |
| `MemoryInspector` | Timeline, Heatmap, Decay-Graph, Relationen |
| `SkillMarketplace` | Skill Store mit Filter, Suche, Install/Deinstall |
| `AdminPanel` | System-Stats, API-Kosten, Memory-Management |
| `MorningBriefing` | Tagesstart mit Wetter + Zusammenfassung |
| `ChallengeMode` | 7 Challenge-Typen mit Streaks |
| `AIDiary` | Automatisches KI-Tagebuch |
| `SecretNotes` | PIN-geschuetzte verschluesselte Notizen |
| `ThoughtTimeline` | Chronologischer Gedanken-Zeitstrahl |
| `PersonalityRadar` | Canvas-basiertes Interessen-Radar |
| `CanvasBoard` | Whiteboard mit Undo/Redo |
| `TimeCapsules` | Zeitkapseln erstellen und oeffnen |
| `CodeExecutor` | Code ausfuehren (JS/Python/PS) |
| `LocalRAG` | Dokumente importieren und durchsuchen |
| `EmotionDashboard` | Emotions-Analyse und -Tracking |
| `SettingsPanel` | Einstellungen (Themes, KI, Privacy) |

---

## Konfiguration (.env)

```env
# Pflicht
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Datenbank
DATABASE_URL="file:./prisma/neon.db"

# Lokale KI (optional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b

# KI-Router
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70

# Sicherheit (optional)
API_ACCESS_TOKEN=
ADMIN_ACCESS_TOKEN=
ENCRYPTION_KEY=                  # 32 Zeichen fuer Secret Notes

# Optional
REDIS_URL=redis://localhost:6379
CHROMA_URL=http://localhost:8000
```

---

## Start & Entwicklung

```bash
# Abhaengigkeiten installieren
npm install

# Datenbank initialisieren
npm run prisma:generate
npm run prisma:migrate

# Entwicklung starten (Backend + Frontend)
npm run dev

# Nur Backend (Port 3001)
npm run dev:backend

# Nur Frontend (Port 5173)
npm run dev:frontend

# Produktions-Build
npm run build

# Prisma Studio (DB-Browser)
npm run prisma:studio
```

**Voraussetzungen:**
- Node.js 20+
- Anthropic API-Key
- Optional: Ollama (`ollama pull gemma3:12b`)
- Optional: Python 3.10+ (`pip install faster-whisper`)

---

## Implementierte Phasen

| Phase | Feature | Status |
|-------|---------|--------|
| 0-4 | Infrastruktur, Chat, Datenbank, AI-Routing | Fertig |
| 5 | Semantische Suche (ChromaDB + Embeddings) | Fertig |
| 6 | 5-Schichten-Gedaechtnis (Consolidation, Decay) | Fertig |
| 7 | Admin Panel (Memory, API-Kosten, Performance) | Fertig |
| 8 | Voice I/O (Web Speech API) | Fertig |
| 9 | Proaktive KI (Kontext-Monitoring, Vorschlaege) | Fertig |
| 10 | Lernmodus (Interview-Sessions) | Fertig |
| 11 | Settings (KI, Privacy, Appearance, Themes) | Fertig |
| 12 | Code-Tools (JS/Python/PS Sandbox) | Fertig |
| 13 | Plugin-System (Skill Store) | Fertig |
| 14 | Web-Suche & Skills (DuckDuckGo, Wikipedia, Wetter) | Fertig |
| 15 | Performance (Dashboard, Monitoring) | Fertig |
| 16 | Security (Token-Auth, Rate-Limiting, Helmet) | Fertig |
| 17 | Magic Features (Emotionen, Zeitkapseln, Predictions) | Fertig |
| 18 | Magic v2 (Briefing, Radar, Timeline, Notizen, Diary, Challenges) | Fertig |
| 19 | Entdecken-Seite & Feature Hub | Fertig |
| 20 | Voice v2 (Edge TTS, Whisper STT, Voice Chat Popup) | Fertig |
| 21 | Lernender Orchestrator (UCB1, BanditSelector) | Fertig |
| 22 | Memory Inspector (Timeline, Heatmap, Decay, Relationen) | Fertig |
| 23 | Skill Marketplace (Install, Deinstall, Bewertungen) | Fertig |
| 24 | Todos & Einkaufslisten (Slash-Commands, KI-Kategorisierung, UI) | Fertig |
| 25 | Kalender / Terminkalender (Monats-/Listenansicht, KI-Kategorisierung, Datum-Parser, Slash-Commands, natuerliche Sprache) | Fertig |

---

*NEON AI Assistant - Dokumentation v2.1*
