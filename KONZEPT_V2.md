# NEON AI Assistant — Konzept V2

> Vollstaendiges Konzeptdokument mit Architektur, Hardware-Profil, Feature-Uebersicht und Roadmap.
> Stand: 2026-03-27

---

## 1. Vision & Ziel

NEON ist ein **persoenlicher KI-Assistent**, der lokal laeuft und ueber den **Browser im gesamten Netzwerk** erreichbar ist. Er kombiniert Cloud-KI (Claude) mit lokalen LLMs (Ollama) durch intelligentes Hybrid-Routing und verfuegt ueber ein 5-schichtiges Gedaechtnissystem, das menschliches Erinnern nachahmt.

### Kernphilosophie

| Prinzip | Beschreibung |
|---------|-------------|
| **Privacy First** | Persoenliche/emotionale Gespraeche bleiben lokal (Ollama) |
| **Smart Routing** | Komplexe Aufgaben gehen an Claude, einfache bleiben lokal |
| **Lernfaehig** | Der Assistent lernt Praeferenzen und Gewohnheiten des Nutzers |
| **Netzwerk-App** | Reine Web-App, erreichbar von jedem Geraet im LAN (PC, Handy, Tablet) |
| **Kein Electron** | Laeuft direkt im Browser — kein Desktop-Wrapper, kein Overhead |
| **Erweiterbar** | Plugin/Skill-System fuer neue Faehigkeiten |

---

## 2. Hardware-Profil (Zielsystem)

| Komponente | Spezifikation | Relevanz fuer NEON |
|-----------|---------------|-------------------|
| **CPU** | AMD Ryzen 7 5700G (8C/16T, 3.8 GHz) | Backend-Server, Embedding-Berechnung, Node.js |
| **GPU** | NVIDIA RTX 3060 (12 GB VRAM) | Ollama-Modelle per CUDA, schnelle Inferenz |
| **iGPU** | AMD Radeon Vega (integriert) | Display-Ausgabe, entlastet RTX fuer KI |
| **RAM** | 64 GB DDR4 | Alle Services gleichzeitig ohne Engpass |
| **Storage** | Samsung 970 EVO Plus 1TB (NVMe) | Datenbank, Vektoren, schnelle I/O |
| **OS** | Windows 11 Pro | Docker Desktop, WSL2-Unterstuetzung |

### Hardware-Optimierungen

```
Ollama-Konfiguration (empfohlen):
├── Modell: gemma3:12b (passt in 12 GB VRAM)
├── GPU Layers: ALL (volle GPU-Beschleunigung via CUDA)
├── Context Window: 8192 Tokens
├── Parallel Requests: 2 (64 GB RAM erlaubt das)
└── Alternative Code-Modell: deepseek-coder-v2:16b (~11 GB VRAM)

Speicher-Aufteilung (geschaetzt):
├── Ollama + Modell:            ~10 GB VRAM + ~4 GB RAM
├── PostgreSQL:                 ~1-2 GB RAM
├── Redis:                      ~512 MB RAM
├── ChromaDB:                   ~1-2 GB RAM
├── Node.js Backend:            ~500 MB RAM
├── Embeddings (Transformers.js): ~500 MB RAM
├── Browser (Frontend):         ~300 MB RAM
└── Gesamt:                     ~9-10 GB RAM (von 64 GB verfuegbar)

→ Fazit: Massive Reserven. Der komplette Stack laeuft problemlos parallel.
```

---

## 3. Architektur

### 3.1 Reine Web-App im Netzwerk (Kein Electron)

```
[Beliebiger Browser] → [HTTP/WebSocket] → [Express Backend] → [AI Services]
     └── Chrome, Firefox, Safari, Handy-Browser
     └── Erreichbar von jedem Geraet im Netzwerk
     └── Kein Electron-Overhead
     └── PWA-Installation moeglich (App-Feeling)
```

### 3.2 Netzwerk-Konfiguration

```
              ┌──────────────┐
              │  NEON Server  │
              │  (dein PC)    │
              │               │
              │ Backend :3001 │◄──── http://192.168.x.x:3001
              │ Frontend:5173 │◄──── http://192.168.x.x:5173 (dev)
              │ Ollama :11434 │
              │ ChromaDB:8000 │
              │ Redis  :6379  │
              │ Postgres:5432 │
              └──────┬───────┘
                     │ LAN / WLAN
        ┌────────────┼────────────┐
        │            │            │
   ┌────┴────┐ ┌─────┴────┐ ┌────┴────┐
   │ Desktop │ │  Handy   │ │ Tablet  │
   │ Chrome  │ │ Browser  │ │ Browser │
   └─────────┘ └──────────┘ └─────────┘
```

### 3.3 System-Architektur (Gesamt)

```
┌─────────────────────────────────────────────────────────────┐
│              BROWSER (Chrome / Firefox / Handy)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / Vite / Zustand                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐           │  │
│  │  │   Chat   │ │Entdecken │ │  Skills &  │   ...     │  │
│  │  │Interface │ │  Seite   │ │Feature Hub │           │  │
│  │  └────┬─────┘ └────┬─────┘ └─────┬──────┘           │  │
│  │       └─────────────┴─────────────┘                   │  │
│  │              Zustand Store (40+ Views)                │  │
│  │                     │                                 │  │
│  │         Socket.io Client + REST API                   │  │
│  └─────────────────────┬─────────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP / WebSocket (Port 3001)
┌─────────────────────────┼───────────────────────────────────┐
│              EXPRESS.JS BACKEND (0.0.0.0:3001)              │
│  ┌──────────────────────┴──────────────────────────────┐    │
│  │                   API Layer                          │    │
│  │  REST Routes │ WebSocket Events │ Static Files      │    │
│  └──────────────────────┬──────────────────────────────┘    │
│  ┌──────────────────────┴──────────────────────────────┐    │
│  │                Service Layer (35+)                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │    │
│  │  │    AI    │  │  Memory  │  │     Search       │   │    │
│  │  │  Router  │  │ Manager  │  │   (ChromaDB)     │   │    │
│  │  │ (5-Stage)│  │(5-Layer) │  │  (Semantic)      │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │    │
│  │  ┌────┴────┐   ┌─────┴─────┐   ┌──────┴──────┐     │    │
│  │  │ Claude  │   │  Prisma   │   │ Embeddings  │     │    │
│  │  │ Ollama  │   │(Database) │   │(Transformers│     │    │
│  │  │ Gemma3  │   │           │   │    .js)     │     │    │
│  │  └────┬────┘   └─────┬─────┘   └──────┬──────┘     │    │
│  └───────┼──────────────┼────────────────┼─────────────┘    │
└──────────┼──────────────┼────────────────┼──────────────────┘
           │              │                │
┌──────────┴──┐  ┌────────┴───┐  ┌─────────┴─────┐
│   Ollama    │  │ PostgreSQL │  │   ChromaDB    │
│ (RTX 3060)  │  │   + Redis  │  │  (Vektoren)   │
│  Port 11434 │  │ Port 5432  │  │  Port 8000    │
└─────────────┘  └────────────┘  └───────────────┘
```

---

## 4. Tech-Stack

### 4.1 Frontend (Browser)

| Technologie | Version | Zweck |
|------------|---------|-------|
| React | 18+ | UI-Framework |
| TypeScript | 5+ | Type Safety |
| Vite | 5+ | Build Tool & Dev Server |
| Zustand | 5+ | State Management |
| Socket.io Client | 4+ | Echtzeit-Kommunikation |
| Lucide React | 0.469+ | Icons |
| React Markdown | 9+ | Markdown-Rendering |
| Rehype Highlight | 7+ | Syntax Highlighting |
| Framer Motion | 12+ | Animationen |

### 4.2 Backend

| Technologie | Version | Zweck |
|------------|---------|-------|
| Node.js | 20+ | Runtime |
| Express.js | 4+ | HTTP Server + Static File Serving |
| TypeScript | 5+ | Type Safety |
| Socket.io | 4+ | WebSocket Server |
| Prisma | 6+ | ORM & Migrations |
| Winston | 3+ | Logging |
| Helmet | 7+ | HTTP Security |
| Multer | 1+ | File Uploads |

### 4.3 KI & ML

| Technologie | Zweck |
|------------|-------|
| Anthropic SDK (Claude) | Cloud-KI fuer komplexe Aufgaben |
| Ollama + Gemma3 12B | Lokale KI fuer schnelle/private Aufgaben |
| Transformers.js | Lokale Embedding-Berechnung (kein API-Call noetig) |
| ChromaDB | Vektor-Datenbank fuer semantische Suche |

### 4.4 Infrastruktur (Docker, optional)

| Service | Image | Port | Zweck |
|---------|-------|------|-------|
| PostgreSQL | postgres:16-alpine | 5432 | Primaere Datenbank |
| Redis | redis:7-alpine | 6379 | Caching & Session-Store |
| ChromaDB | chromadb/chroma:latest | 8000 | Vektor-Datenbank |

---

## 5. Features im Detail

### 5.1 Hybrid AI Router (5-Stufen-Orchestrator)

```
Nachricht eingehend
       │
       ▼
┌──────────────┐
│ Stage 1:     │──── Emotional/Persoenlich? ──→ Ollama
│ Domain-      │
│ Klassifikation│──── Code/Analyse/Planung? ──→ weiter zu Stage 2
└──────┬───────┘
       ▼
┌──────────────┐
│ Stage 2:     │──── Score < 70? ──→ Ollama (einfach genug)
│ Komplexitaets-│
│ bewertung    │──── Score ≥ 70? ──→ weiter zu Stage 3
└──────┬───────┘
       ▼
┌──────────────┐
│ Stage 3:     │──── Confidence > 0.65? ──→ Ollama (kann es selbst)
│ Self-        │
│ Confidence   │──── Confidence ≤ 0.65? ──→ weiter zu Stage 4
└──────┬───────┘
       ▼
┌──────────────┐
│ Stage 4:     │──── Depth > 0.85? ──→ Claude (braucht Tiefe)
│ Depth        │
│ Threshold    │──── Depth ≤ 0.85? ──→ Ollama
└──────┬───────┘
       ▼
┌──────────────┐
│ Stage 5:     │──── Antwort generieren & streamen
│ Execution    │
└──────────────┘
```

**Konfiguration (.env):**
```env
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70
```

### 5.2 5-Schicht-Gedaechtnissystem

| Schicht | Lebensdauer | Zweck | Beispiel |
|---------|-------------|-------|----------|
| **Working Memory** | 1-4 Stunden | Aktive Session | "User fragt gerade nach Python" |
| **Short-Term** | 1-7 Tage | Kuerzliche Infos | "Gestern sprach er ueber sein Projekt" |
| **Long-Term** | Permanent | Wichtige Fakten | "User mag TypeScript" |
| **Episodic** | Variabel | Ereignisse | "Am 15.03. hatte er ein Vorstellungsgespraech" |
| **Semantic** | Permanent | Strukturiertes Wissen | "TypeScript ist eine Obermenge von JavaScript" |

**Mechanismen:**
- **Importance Scoring:** Keywords, Komplexitaet, Code-Praesenz, Feedback, Zugriffshaeufigkeit
- **Automatic Consolidation:** Aehnliche Erinnerungen werden zusammengefuehrt
- **Memory Decay:** Unwichtige Erinnerungen verblassen mit der Zeit
- **Promotion:** Wichtige Short-Term → Long-Term
- **Context Window:** Intelligente Auswahl relevanter Erinnerungen (max ~5000 Tokens)
- **Knowledge Graph:** Relationen zwischen Erinnerungen fuer besseres Reasoning

### 5.3 Entdecken-Seite

Interaktive Uebersichtsseite (inspiriert von Microsoft Copilot):

- **Hero-Banner** mit animierten SVG-Illustrationen und tageszeitabhaengiger Begruessung
- **Schnellstart-Buttons** fuer Neuer Chat, Morgenbriefing, Challenges, Whiteboard
- **Prompt-Vorschlaege** nach 7 Kategorien: Lernen, Programmieren, Kreativ, Produktivitaet, Analyse, Recherche, Alltag
- **Feature-Karten** mit SVG-Illustrationen fuer alle Magic Features
- Jede Karte navigiert direkt zum entsprechenden Feature

### 5.4 Magic Features

Einzigartige Funktionen, die ueber einen klassischen Chatbot hinausgehen:

| Feature | Beschreibung | Technik |
|---------|-------------|---------|
| **Morgenbriefing** | Taeglich personalisierte Zusammenfassung mit Wetter, Streaks und Vorschlaegen | Wetter-API, Summary-API, Streaks in localStorage |
| **Interessen-Radar** | Radar-Chart zur Visualisierung der Interessen in 6 Kategorien (Technik, Wissenschaft, Kreativitaet, Produktivitaet, Soziales, Lernen) | Canvas API (HiDPI), Keyword-Analyse aus Memories + Konversationen |
| **Gedanken-Zeitstrahl** | Chronologische Timeline aller Gespraeche, Erinnerungen, Recherchen und Zeitkapseln | Conversations-API, Memory-API, Capsules-API, gruppiert nach Datum |
| **Geheime Notizen** | PIN-geschuetzter privater Notiz-Editor | localStorage mit Base64-Kodierung, PIN als btoa() |
| **KI-Tagebuch** | NEON schreibt automatisch ein Journal ueber eure Gespraeche | Summary-API, automatische Textgenerierung auf Deutsch, localStorage |
| **Challenges** | 7 Challenge-Typen mit Streaks und 6 Badges | Deterministisch aus Datum, Stats in localStorage |
| **Zeitkapseln** | Nachrichten an dein zukuenftiges Ich planen | Backend Capsules-API mit automatischem Oeffnen |
| **Agenten-Ketten** | Mehrstufige KI-Workflows automatisieren | Backend Chain-Execution mit Schritt-fuer-Schritt-Verarbeitung |
| **Whiteboard** | Zeichnen, Formen, Text mit Undo/Redo und PNG-Export | Canvas API, Toolbar mit Werkzeugen |
| **Dateien-RAG** | Lokale Ordner indexieren und semantisch durchsuchen | Embeddings + Vektor-Suche ueber lokale Dateien |
| **Tagesrueckblick** | Automatische Zusammenfassung des Tages | Summary-API aggregiert Konversationen + Memories |
| **Erklaer-Stufen** | Jede Antwort auf 5 Niveaus erklaeren lassen | Kind (5), Schueler (12), Student, Fachperson, Experte (PhD) |

### 5.5 Skills & Feature Hub

Zentraler Ort fuer alle erweiterten Funktionen:

- **Backend-Skills** aus API mit Toggle-Schalter und Settings
- **NEON Features** als Karten-Grid mit Kategorie-Filter (Alle / Magic / Produktivitaet / Kreativ)
- Jede Feature-Karte navigiert direkt zum entsprechenden View

### 5.6 Weitere implementierte Features

| Feature | Beschreibung |
|---------|-------------|
| **Slash-Commands** | `/wetter`, `/suche`, `/code`, `/kapsel`, `/recherche`, `/memory`, `/hilfe` direkt im Chat |
| **Konversations-Export** | Chats als Markdown oder Text exportieren |
| **Dark/Light/OLED Themes** | 3 Farbschemata mit visueller Vorschau |
| **Drag & Drop** | Dateien direkt in den Chat ziehen (Bilder, PDFs, Text) |
| **Multi-User** | Mehrere Profile mit eigenen Avataren und separatem Gedaechtnis |
| **Sprach-Persoenlichkeiten** | 5 KI-Modi: Sachlich, Freundlich, Sarkastisch, Lehrer, Pirat |
| **Konversations-Verzweigung** | Ab jeder Nachricht einen alternativen Gespraechsverlauf starten |
| **Code-Ausfuehrung** | JavaScript, Python, PowerShell in einer Sandbox |
| **Web-Suche** | DuckDuckGo + Wikipedia Integration |
| **Auto-Learning** | Manuelle Recherche, Ergebnisse werden im Gedaechtnis gespeichert |
| **Wetter** | OpenWeatherMap Integration mit Vorhersage |
| **Emotion Tracking** | Stimmungserkennung in Gespraechen |
| **Proaktive KI** | Kontext-Monitoring, Vorschlaege, Morgengruesse |
| **Admin Panel** | Memory-Management, Extraktion, API-Kosten-Tracking, Performance-Dashboard |
| **Voice I/O** | Web Speech API im Browser (STT + TTS) |
| **PWA** | Installierbar als App mit Push-Notifications und Offline-Support |

---

## 6. Datenbank-Schema

### 6.1 Kern-Tabellen

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│    users     │────<│conversations │────<│   messages    │
│             │     │              │     │              │
│ id          │     │ id           │     │ id           │
│ username    │     │ userId       │     │ conversationId│
│ displayName │     │ title        │     │ role         │
│ createdAt   │     │ isPinned     │     │ content      │
└─────────────┘     │ createdAt    │     │ provider     │
                    └──────────────┘     │ tokensUsed   │
                                         └──────────────┘
```

### 6.2 Memory-Tabellen

```
┌────────────────┐     ┌────────────────┐
│ memory_entries │────<│memory_embeddings│
│                │     │                │
│ id, userId     │     │ memoryId       │
│ layer          │     │ vector, model  │
│ content        │     └────────────────┘
│ importance     │
│ accessCount    │     ┌────────────────┐
│ decayFactor    │────<│  memory_tags   │
│ lastAccessed   │     │ memoryId, tag  │
│ expiresAt      │     └────────────────┘
│ isActive       │
└───────┬────────┘     ┌────────────────┐
        └─────────────<│memory_relations│
                       │ sourceId       │
                       │ targetId       │
                       │ relationType   │
                       │ strength       │
                       └────────────────┘
```

### 6.3 Weitere Tabellen

| Tabelle | Zweck |
|---------|-------|
| `user_preferences` | Einstellungen pro User |
| `api_usage` | Token-Tracking & Kosten (Claude) |
| `documents` | Hochgeladene Dateien (RAG) |
| `feedback` | User-Feedback fuer Lernmodus |
| `proactive_messages` | Vorschlaege & Erinnerungen |
| `episodes` | Zeitgebundene Ereignisse |
| `knowledge_entries` | Semantisches Wissen |
| `memory_extractions` | Extraktions-Audit-Trail |

---

## 7. API-Referenz

### REST Endpoints

```
── Core ──
GET  /api/health                        → System-Status
GET  /api/config                        → Aktuelle Konfiguration

── Konversationen ──
POST /api/conversations                 → Chat erstellen
GET  /api/conversations/:userId         → Chats auflisten
DELETE /api/conversations/:id           → Chat loeschen

── Memory ──
GET  /api/memory/:userId                → Erinnerungen abrufen
POST /api/memory                        → Erinnerung erstellen
POST /api/memory/:userId/retrieve       → Relevante Erinnerungen suchen
POST /api/memory/:userId/consolidate    → Konsolidierung starten
GET  /api/memory/:userId/stats          → Memory-Statistiken

── Suche ──
GET  /api/search?q=query&limit=10       → Semantische Suche
POST /api/search/reindex                → Alle Nachrichten neu indexieren

── Admin ──
GET  /api/admin/stats                   → System-Statistiken
POST /api/admin/extract-memories        → Memory-Extraktion triggern
POST /api/admin/cleanup-memories        → Memories nach Filter loeschen
POST /api/admin/memory/clear-working    → Working Memory leeren
GET  /api/admin/usage                   → API-Kosten (EUR)
GET  /api/admin/performance             → Performance-Metriken

── Skills ──
GET  /api/skills                        → Skills auflisten
PATCH /api/skills/:id/toggle            → Skill aktivieren/deaktivieren
POST /api/skills/knowledge-base/upload  → Dokument fuer RAG hochladen
POST /api/skills/knowledge-base/query   → RAG-Abfrage

── Magic ──
POST /api/magic/capsules                → Zeitkapsel erstellen
GET  /api/magic/capsules/:userId        → Zeitkapseln abrufen
GET  /api/magic/weather                 → Wetter abfragen
GET  /api/summary/daily                 → Tages-Zusammenfassung

── Code ──
POST /api/code/execute                  → Code ausfuehren (JS/Python/PS)

── RAG ──
POST /api/rag/index                     → Ordner indexieren
GET  /api/rag/search?q=query            → RAG-Suche
GET  /api/rag/status                    → RAG-Status

── Settings ──
GET  /api/settings                      → Einstellungen laden
POST /api/settings                      → Einstellungen speichern
```

### WebSocket Events

```
── Client → Server ──
user-message          → Chat-Nachricht senden (mit Streaming)
get-conversations     → Chats laden
delete-conversation   → Chat loeschen
rename-conversation   → Chat umbenennen
typing-start/stop     → Tipp-Indikator

── Server → Client ──
ai-response-chunk     → Streaming-Antwort (Token fuer Token)
ai-response-complete  → Antwort fertig
conversations-list    → Aktualisierte Chat-Liste
typing-indicator      → KI tippt
error                 → Fehlermeldungen
```

---

## 8. Projektstruktur

```
neon-ai-assistant/
├── backend/                          # Express.js Server
│   ├── src/
│   │   ├── index.ts                 # Server (0.0.0.0:3001) + Static Files
│   │   ├── api/
│   │   │   ├── routes.ts            # Haupt-Router
│   │   │   ├── websocket.ts         # Socket.io Events
│   │   │   ├── memoryRoutes.ts      # Memory-Endpoints
│   │   │   ├── adminRoutes.ts       # Admin-Endpoints
│   │   │   ├── settingsRoutes.ts    # Konfigurations-Endpoints
│   │   │   ├── skillRoutes.ts       # Skills-Management
│   │   │   ├── uploadRoutes.ts      # Datei-Uploads
│   │   │   ├── proactiveRoutes.ts   # Proaktive KI
│   │   │   ├── magicRoutes.ts       # Capsules, Weather, Summary
│   │   │   └── voice.ts             # Voice I/O
│   │   ├── services/                # 35+ Business Logic Services
│   │   │   ├── router/              # AI Routing (5-Stage Orchestrator)
│   │   │   ├── claude/              # Claude API Integration
│   │   │   ├── ollama/              # Ollama/Gemma3 Integration
│   │   │   ├── memory/              # 5-Layer Memory System
│   │   │   ├── search/              # Semantische Suche (ChromaDB)
│   │   │   ├── embeddings/          # Vektor-Generierung (Transformers.js)
│   │   │   ├── learning/            # Lernmodus / Interview
│   │   │   ├── proactive/           # Kontext-Monitoring
│   │   │   ├── plugins/             # Plugin-Manager
│   │   │   ├── skills/              # Skill-Logik (Wetter, RAG, etc.)
│   │   │   └── ...
│   │   └── utils/                   # Logger, Helpers, Security
│   ├── prisma/
│   │   └── schema.prisma            # Datenbank-Schema (16 Tabellen)
│   └── package.json
│
├── frontend/                         # React Web-App
│   ├── src/
│   │   ├── renderer/
│   │   │   ├── App.tsx              # Haupt-Komponente mit Sidebar + Routing
│   │   │   ├── components/          # 40+ UI-Komponenten
│   │   │   │   ├── ChatInterface.tsx
│   │   │   │   ├── MessageBubble.tsx    # Chat-Blasen mit Erklaer-Stufen
│   │   │   │   ├── DiscoverPage.tsx     # Entdecken-Seite mit SVG-Illustrationen
│   │   │   │   ├── SkillStore.tsx       # Skills & Feature Hub
│   │   │   │   ├── MorningBriefing.tsx  # Morgenbriefing
│   │   │   │   ├── PersonalityRadar.tsx # Interessen-Radar (Canvas)
│   │   │   │   ├── ThoughtTimeline.tsx  # Gedanken-Zeitstrahl
│   │   │   │   ├── SecretNotes.tsx      # Geheime Notizen (PIN)
│   │   │   │   ├── AIDiary.tsx          # KI-Tagebuch
│   │   │   │   ├── ChallengeMode.tsx    # Challenges mit Badges
│   │   │   │   ├── WhiteboardCanvas.tsx # Whiteboard
│   │   │   │   ├── SemanticSearch.tsx
│   │   │   │   ├── MemoryDashboard.tsx
│   │   │   │   ├── AdminPanel.tsx
│   │   │   │   ├── SettingsPanel.tsx
│   │   │   │   └── ...
│   │   │   ├── store/useAppStore.ts # Zustand State (22 ViewModes)
│   │   │   ├── services/            # STT, TTS Services
│   │   │   └── styles/
│   │   └── main.tsx                 # React Entry Point
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── shared/types/                    # Geteilte TypeScript-Typen
├── docker/                          # Docker Compose (PostgreSQL, Redis, ChromaDB)
├── docs/screenshots/                # SVG-Illustrationen fuer README
├── scripts/                         # Wartungs-Skripte
├── KONZEPT_V2.md                    # ← Dieses Dokument
├── README.md
├── SETUP.md
└── package.json                     # Workspace-Root
```

---

## 9. Konfiguration

### 9.1 Backend (.env)

```env
# ── Server ──
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# ── Datenbank ──
DATABASE_URL="file:./prisma/neon.db"   # SQLite (aktuell)
# DATABASE_URL="postgresql://neon:neon@localhost:5432/neon"  # PostgreSQL (optional)

# ── AI Services ──
ANTHROPIC_API_KEY=sk-ant-api03-...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b

# ── AI Router ──
ENABLE_ORCHESTRATOR=true
CLAUDE_THRESHOLD=0.85
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70

# ── Sicherheit ──
ENCRYPTION_KEY=<32-zeichen-key>

# ── Services (Docker, optional) ──
REDIS_URL=redis://localhost:6379
CHROMA_URL=http://localhost:8000
```

### 9.2 Vite Dev-Server (Frontend)

```ts
// frontend/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
```

### 9.3 Docker Compose (optional)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: neon
      POSTGRES_USER: neon
      POSTGRES_PASSWORD: neon
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  chromadb:
    image: chromadb/chroma:latest
    ports: ["8000:8000"]
    volumes:
      - chromadata:/chroma/chroma

volumes:
  pgdata:
  chromadata:
```

---

## 10. Verhaltensregeln (AGENT_RULES)

| Regel | Beschreibung |
|-------|-------------|
| **Memory ≠ Gespraechsthema** | Gespeicherte Fakten werden nicht ungefragt erwaehnt |
| **Drittpersonen-Schutz** | Infos ueber andere Personen werden sensibel behandelt |
| **Sensitive Tags** | `#sensitive`, `#deceased`, `#private` → besondere Vorsicht |
| **Reality Check** | KI kennt ihre Grenzen und gibt das zu |
| **Kein Moral Momentum** | Keine Ueberreaktionen auf emotionale Inhalte |
| **Privacy Respekt** | Gespeicherte Infos werden nicht proaktiv offengelegt |

---

## 11. Projekt-Statistiken

| Metrik | Wert |
|--------|------|
| Backend Services | 35+ |
| API Endpoints | 70+ |
| UI Komponenten | 40+ |
| ViewModes | 22 |
| Datenbank-Tabellen | 16 |
| Magic Features | 12 |
| Architektur | Monorepo (3 Workspaces) |
| Codezeilen | ~18.000+ |
| Dateien | 150+ |

---

## 12. Status aller Phasen

| Phase | Feature | Status |
|-------|---------|--------|
| 0-4 | Infrastruktur, Chat, Datenbank, AI-Integration | Fertig |
| 5 | Semantische Suche (ChromaDB + Embeddings) | Fertig |
| 6 | 5-Layer Memory System | Fertig |
| 7 | Admin Panel | Fertig |
| 8 | Voice I/O (Web Speech API) | Fertig |
| 9 | Proaktive KI | Fertig |
| 10 | Lernmodus | Fertig |
| 11 | Settings | Fertig |
| 12 | Code-Tools (Sandbox) | Fertig |
| 13 | Plugin/Skill-System | Fertig |
| 14 | Web-Suche & Skills | Fertig |
| 15 | Performance-Dashboard | Fertig |
| 16 | Security (Auth, Rate-Limiting, CORS) | Fertig |
| 17 | Magic Features v1 (Emotions, Zeitkapseln, Predictive) | Fertig |
| 18 | Magic Features v2 (Briefing, Radar, Timeline, Notizen, Tagebuch, Challenges) | Fertig |
| 19 | Entdecken-Seite & Feature Hub | Fertig |

---

## 13. Roadmap

### Naechste Schritte

- Responsive Design (Mobile-Optimierung)
- Multi-Modell-Routing (Code-Modell + Chat-Modell)
- CI/CD Pipeline (GitHub Actions)
- Unit Tests fuer Kern-Services
- Whisper STT Integration (Backend)
- GPU-Embeddings (ONNX Runtime + CUDA)

---

> **Dieses Dokument wird fortlaufend aktualisiert.**
> Letzte Aenderung: 2026-03-27
> Gebaut von Downloader4k mit Claude AI.
