# NEON AI Assistant — Konzept V2

> Vollständiges Konzeptdokument mit Architektur, Hardware-Profil, Audit-Ergebnissen, Fixplan und Roadmap.
> Stand: 2026-03-21

---

## 1. Vision & Ziel

NEON ist ein **persönlicher KI-Assistent**, der lokal läuft und über den **Browser im gesamten Netzwerk** erreichbar ist. Er kombiniert Cloud-KI (Claude) mit lokalen LLMs (Ollama) durch intelligentes Hybrid-Routing und verfügt über ein 5-schichtiges Gedächtnissystem, das menschliches Erinnern nachahmt.

### Kernphilosophie

| Prinzip | Beschreibung |
|---------|-------------|
| **Privacy First** | Persönliche/emotionale Gespräche bleiben lokal (Ollama) |
| **Smart Routing** | Komplexe Aufgaben gehen an Claude, einfache bleiben lokal |
| **Lernfähig** | Der Assistent lernt Präferenzen und Gewohnheiten des Nutzers |
| **Netzwerk-App** | Reine Web-App, erreichbar von jedem Gerät im LAN (PC, Handy, Tablet) |
| **Kein Electron** | Läuft direkt im Browser — kein Desktop-Wrapper, kein Overhead |
| **Erweiterbar** | Plugin-System für neue Fähigkeiten |

---

## 2. Hardware-Profil (Zielsystem)

| Komponente | Spezifikation | Relevanz für NEON |
|-----------|---------------|-------------------|
| **CPU** | AMD Ryzen 7 5700G (8C/16T, 3.8 GHz) | Backend-Server, Embedding-Berechnung, Node.js |
| **GPU** | NVIDIA RTX 3060 (12 GB VRAM) | Ollama-Modelle per CUDA, schnelle Inferenz |
| **iGPU** | AMD Radeon Vega (integriert) | Display-Ausgabe, entlastet RTX für KI |
| **RAM** | 64 GB DDR4 | Alle Services gleichzeitig ohne Engpass |
| **Storage** | Samsung 970 EVO Plus 1TB (NVMe) | Datenbank, Vektoren, schnelle I/O |
| **OS** | Windows 11 Pro | Docker Desktop, WSL2-Unterstützung |

### Hardware-Optimierungen

```
Ollama-Konfiguration (empfohlen):
├── Modell: gemma3:12b (passt in 12 GB VRAM)
├── GPU Layers: ALL (volle GPU-Beschleunigung via CUDA)
├── Context Window: 8192 Tokens
├── Parallel Requests: 2 (64 GB RAM erlaubt das)
└── Alternative Code-Modell: deepseek-coder-v2:16b (~11 GB VRAM)

Speicher-Aufteilung (geschätzt):
├── Ollama + Modell:            ~10 GB VRAM + ~4 GB RAM
├── PostgreSQL:                 ~1-2 GB RAM
├── Redis:                      ~512 MB RAM
├── ChromaDB:                   ~1-2 GB RAM
├── Node.js Backend:            ~500 MB RAM
├── Embeddings (Transformers.js): ~500 MB RAM
├── Browser (Frontend):         ~300 MB RAM
└── Gesamt:                     ~9-10 GB RAM (von 64 GB verfügbar)

→ Fazit: Massive Reserven. Der komplette Stack läuft problemlos parallel.
```

---

## 3. Architektur

### 3.1 Kein Electron — Reine Web-App im Netzwerk

**Vorher (V1) — Electron Desktop-App:**
```
[Electron App] → [IPC Bridge] → [Express Backend] → [AI Services]
     └── Chromium-Subprocess, Preload Scripts, Main Process
     └── Nur auf dem lokalen PC nutzbar
     └── ~150-200 MB extra RAM-Verbrauch
```

**Nachher (V2) — Netzwerk Web-App:**
```
[Beliebiger Browser] → [HTTP/WebSocket] → [Express Backend] → [AI Services]
     └── Chrome, Firefox, Safari, Handy-Browser
     └── Erreichbar von jedem Gerät im Netzwerk
     └── Kein Electron-Overhead
```

**Was entfernt wird:**

| Datei | Grund |
|-------|-------|
| `frontend/src/main/index.ts` | Electron Main Process — nicht mehr nötig |
| `frontend/src/preload/index.ts` | Electron Preload/IPC Bridge — nicht mehr nötig |
| Alle `window.electron` Referenzen | Electron-spezifische API |

**Was sich dadurch verbessert:**
- ~150-200 MB weniger RAM (kein Chromium-Subprocess)
- Zugriff von **jedem Gerät im Netzwerk** (Handy, Tablet, Laptop, etc.)
- Kein Electron-Update-Management nötig
- Einfacheres Build & Deployment
- Chrome DevTools direkt nutzbar
- PWA-Installation möglich (App-Feeling ohne Electron)

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

**Backend-Änderung:** `HOST=0.0.0.0` statt `localhost` → bindet auf alle Netzwerk-Interfaces.

**Produktionsmodus:** Backend serviert das gebaute Frontend als statische Dateien → nur **ein Port (3001)** nötig.

### 3.3 System-Architektur (Gesamt)

```
┌─────────────────────────────────────────────────────────────┐
│              BROWSER (Chrome / Firefox / Handy)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / Vite / Tailwind                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐           │  │
│  │  │   Chat   │ │  Memory  │ │  Settings  │   ...     │  │
│  │  │Interface │ │Dashboard │ │   Panel    │           │  │
│  │  └────┬─────┘ └────┬─────┘ └─────┬──────┘           │  │
│  │       └─────────────┴─────────────┘                   │  │
│  │                     │                                 │  │
│  │              Zustand Store                            │  │
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
│  │                Service Layer                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │    │
│  │  │    AI    │  │  Memory  │  │     Search       │   │    │
│  │  │  Router  │  │ Manager  │  │   (ChromaDB)     │   │    │
│  │  │ (5-Stage)│  │(5-Layer) │  │  (Semantic)      │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │    │
│  │       │              │                 │             │    │
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

### 4.1 Frontend (Browser — KEIN Electron)

| Technologie | Version | Zweck |
|------------|---------|-------|
| React | 18+ | UI-Framework |
| TypeScript | 5+ | Type Safety |
| Vite | 5+ | Build Tool & Dev Server |
| Tailwind CSS | 3+ | Styling |
| Framer Motion | 12+ | Animationen |
| Zustand | 5+ | State Management |
| Socket.io Client | 4+ | Echtzeit-Kommunikation |
| React Markdown | 9+ | Markdown-Rendering |
| Rehype Highlight | 7+ | Syntax Highlighting |
| Lucide React | 0.469+ | Icons |

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
| Anthropic SDK (Claude) | Cloud-KI für komplexe Aufgaben |
| Ollama + Gemma3 12B | Lokale KI für schnelle/private Aufgaben |
| Transformers.js | Lokale Embedding-Berechnung (kein API-Call nötig) |
| ChromaDB | Vektor-Datenbank für semantische Suche |

### 4.4 Infrastruktur (Docker)

| Service | Image | Port | Zweck |
|---------|-------|------|-------|
| PostgreSQL | postgres:16-alpine | 5432 | Primäre Datenbank |
| Redis | redis:7-alpine | 6379 | Caching & Session-Store |
| ChromaDB | chromadb/chroma:latest | 8000 | Vektor-Datenbank |

---

## 5. Audit-Ergebnisse (Claude + Manus.ai)

### 5.1 Was funktioniert (bestätigt)

| Feature | Status | Bewertung |
|---------|--------|-----------|
| Hybrid AI Router (5-Stage) | ✅ Funktional | Kernstück des Systems, gut implementiert |
| 5-Layer Memory System | ✅ Funktional | Konzeptionell sehr durchdacht |
| Echtzeit-Chat (WebSocket Streaming) | ✅ Funktional | Token-für-Token Streaming |
| Semantische Suche (ChromaDB) | ✅ Funktional | Mit lokalen Embeddings |
| Konversations-Management | ✅ Funktional | CRUD + Pinning |
| Admin Panel (teilweise) | ⚠️ Teilweise | Memory-Ops funktionieren, Import fehlt |
| Interview/Lernmodus | ✅ Funktional | SimpleInterviewService implementiert |
| Web-Suche | ✅ Funktional | DuckDuckGo + Wikipedia |
| Währungsrechner | ✅ Funktional | Echtzeit-Kurse |
| Wetter | ✅ Funktional | OpenWeatherMap Integration |
| Emotion Tracking | ✅ Funktional | Stimmungserkennung |
| Wissensbasis (RAG) | ✅ Funktional | Dokument-Upload + Vektor-Suche |

### 5.2 Kritische Probleme (gefunden)

#### PROBLEM 1: Electron-Reste im Code
- **Dateien:** `frontend/src/main/index.ts`, `frontend/src/preload/index.ts`
- **Impact:** Toter Code, verwirrt Entwickler
- **Fix:** Dateien löschen, keine Electron-Dependency installiert

#### PROBLEM 2: Hardcoded `default-user` (12 Dateien)
- **Backend:** `adminRoutes.ts`, `skillRoutes.ts`, `SkillProcessor.ts`, `userService.ts`
- **Frontend:** `useAppStore.ts`, `AdminPanel.tsx`, `MemoryDashboard.tsx`, `EmotionDashboard.tsx`, `ProactiveNotifications.tsx`, `PredictiveAssistant.tsx`
- **Scripts:** `cleanup_memories.ts`, `seed_memory.ts`
- **Impact:** Keine Multi-User-Fähigkeit, kein Login
- **Fix:** Zentrale `USER_ID` Konstante + später Auth-System

#### PROBLEM 3: Voice/STT ist Platzhalter (501)
- **Datei:** `backend/src/api/voice.ts`
- **Impact:** Whisper STT gibt Fake-Text zurück, TTS-Voices sind hartcodiert
- **Fix:** Web Speech API im Frontend nutzen (funktioniert bereits), Backend-Whisper optional

#### PROBLEM 4: Admin Import nicht implementiert (501)
- **Datei:** `backend/src/api/adminRoutes.ts` Zeile 73-78
- **Impact:** Datei-Upload im Admin-Panel funktioniert nicht
- **Fix:** Multer-Integration (ist bereits als Dependency vorhanden)

#### PROBLEM 5: Plugin-System ist Platzhalter
- **Datei:** `backend/src/services/plugins/PluginManager.ts`
- **Impact:** Dynamisches Plugin-Loading nicht implementiert, nur Mock
- **Fix:** Echtes Plugin-Interface mit dynamischem Import

#### PROBLEM 6: MessageBubble-Actions nicht implementiert
- **Datei:** `frontend/src/renderer/components/MessageBubble.tsx` Zeile 36-44
- **Impact:** "Löschen" und "Als Memory speichern" Buttons loggen nur in Console
- **Fix:** API-Calls implementieren

#### PROBLEM 7: Dokumentation stimmt nicht mit Code überein
- **Issue:** README/SETUP beschreiben Docker/PostgreSQL, aber SQLite wird genutzt
- **Impact:** Neue Entwickler werden verwirrt
- **Fix:** Dokumentation aktualisieren — beides dokumentieren (SQLite für Dev, PostgreSQL für Prod)

#### PROBLEM 8: Admin Stats sind teilweise Mock
- **Datei:** `backend/src/api/adminRoutes.ts` Zeile 17-33
- **Impact:** API-Requests, Response Times, Cache Stats sind Fake-Werte
- **Fix:** Echtes Tracking implementieren oder Mock-Felder entfernen

---

## 6. Features im Detail

### 6.1 Hybrid AI Router (5-Stufen-Orchestrator)

```
Nachricht eingehend
       │
       ▼
┌──────────────┐
│ Stage 1:     │──── Emotional/Persönlich? ──→ Ollama (Identität bewahren)
│ Domain-      │
│ Klassifikation│──── Code/Analyse/Planung? ──→ weiter zu Stage 2
└──────┬───────┘
       ▼
┌──────────────┐
│ Stage 2:     │──── Score < 70? ──→ Ollama (einfach genug)
│ Komplexitäts-│
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
CLAUDE_THRESHOLD=0.85        # Ab wann Claude genutzt wird
SELF_CONFIDENCE_THRESHOLD=0.65
COMPLEXITY_THRESHOLD=70
```

### 6.2 5-Schicht-Gedächtnissystem

| Schicht | Lebensdauer | Zweck | Beispiel |
|---------|-------------|-------|----------|
| **Working Memory** | 1-4 Stunden | Aktive Session | "User fragt gerade nach Python" |
| **Short-Term** | 1-7 Tage | Kürzliche Infos | "Gestern sprach er über sein Projekt" |
| **Long-Term** | Permanent | Wichtige Fakten | "User heißt Thorben, mag TypeScript" |
| **Episodic** | Variabel | Ereignisse | "Am 15.03. hatte er ein Vorstellungsgespräch" |
| **Semantic** | Permanent | Strukturiertes Wissen | "TypeScript ist eine Obermenge von JavaScript" |

**Mechanismen:**
- **Importance Scoring:** Keywords, Komplexität, Code-Präsenz, Feedback, Zugriffshäufigkeit
- **Automatic Consolidation:** Ähnliche Erinnerungen werden zusammengeführt
- **Memory Decay:** Unwichtige Erinnerungen verblassen mit der Zeit
- **Promotion:** Wichtige Short-Term → Long-Term
- **Context Window:** Intelligente Auswahl relevanter Erinnerungen (max ~5000 Tokens)
- **Knowledge Graph:** Relationen zwischen Erinnerungen für besseres Reasoning

### 6.3 Weitere implementierte Features

- **Semantische Suche:** Volltextsuche über Konversationen (Ctrl+K), ChromaDB + lokale Embeddings
- **Voice I/O:** Web Speech API im Frontend (STT + TTS), Whisper-Backend noch Platzhalter
- **Proaktive Intelligenz:** Kontext-Monitoring, Morgengrüße, Abend-Zusammenfassungen
- **Lernmodus:** Interview-Sessions mit Fragen zur Persönlichkeitsentwicklung
- **Admin-Panel:** Memory-Extraktion, Cleanup, Working-Memory-Reset, API-Usage-Tracking
- **Settings:** KI-Verhalten, Privacy-Modi, Appearance
- **Web-Suche:** DuckDuckGo + Wikipedia Integration
- **Währungsrechner:** Echtzeit USD→EUR Konversion
- **Wetter:** OpenWeatherMap mit Vorhersage
- **Emotion Tracking:** Stimmungserkennung in Gesprächen
- **Wissensbasis (RAG):** Dokumente importieren und per Vektor-Suche abfragen
- **Code-Ausführung:** Sandboxed mit Guardrails

---

## 7. Datenbank-Schema

### 7.1 Kern-Tabellen

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

### 7.2 Memory-Tabellen

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

### 7.3 Weitere Tabellen

| Tabelle | Zweck |
|---------|-------|
| `user_preferences` | Einstellungen pro User |
| `api_usage` | Token-Tracking & Kosten (Claude) |
| `documents` | Hochgeladene Dateien (RAG) |
| `feedback` | User-Feedback für Lernmodus |
| `proactive_messages` | Vorschläge & Erinnerungen |
| `episodes` | Zeitgebundene Ereignisse |
| `knowledge_entries` | Semantisches Wissen |
| `memory_extractions` | Extraktions-Audit-Trail |

---

## 8. API-Referenz

### REST Endpoints (Auszug)

```
── Core ──
GET  /api/health                        → System-Status
GET  /api/config                        → Aktuelle Konfiguration

── Konversationen ──
POST /api/conversations                 → Chat erstellen
GET  /api/conversations/:userId         → Chats auflisten
DELETE /api/conversations/:id           → Chat löschen

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
POST /api/admin/cleanup-memories        → Memories nach Filter löschen
POST /api/admin/memory/clear-working    → Working Memory leeren
GET  /api/admin/usage                   → API-Kosten (EUR)
POST /api/admin/import                  → ⚠️ 501 — NOCH NICHT IMPLEMENTIERT

── Skills ──
GET  /api/skills                        → Skills auflisten
POST /api/skills/knowledge-base/upload  → Dokument für RAG hochladen
POST /api/skills/knowledge-base/query   → RAG-Abfrage

── Settings ──
GET  /api/settings                      → Einstellungen laden
POST /api/settings                      → Einstellungen speichern
```

### WebSocket Events

```
── Client → Server ──
user-message          → Chat-Nachricht senden (mit Streaming)
get-conversations     → Chats laden
delete-conversation   → Chat löschen
rename-conversation   → Chat umbenennen
typing-start/stop     → Tipp-Indikator

── Server → Client ──
ai-response-chunk     → Streaming-Antwort (Token für Token)
ai-response-complete  → Antwort fertig
conversations-list    → Aktualisierte Chat-Liste
typing-indicator      → KI tippt
error                 → Fehlermeldungen
```

---

## 9. Fixplan — Priorisiert

### PHASE A: Sofort (Electron raus + Netzwerk + kritische Fixes)

| # | Task | Datei(en) | Aufwand |
|---|------|-----------|---------|
| A1 | **Electron-Dateien löschen** | `frontend/src/main/index.ts`, `frontend/src/preload/index.ts` | 5 min |
| A2 | **`window.electron` Referenzen entfernen** | Alle Frontend-Dateien die darauf zugreifen | 15 min |
| A3 | **Backend auf `0.0.0.0` binden** | `backend/src/index.ts` Zeile 14: `HOST=0.0.0.0` | 2 min |
| A4 | **Backend serviert Frontend** (Prod) | `backend/src/index.ts` — gebautes Frontend als Static Files | 30 min |
| A5 | **Vite Dev-Server für Netzwerk** | `frontend/vite.config.ts` — `server.host: '0.0.0.0'` | 2 min |
| A6 | **CORS für LAN konfigurieren** | `backend/src/index.ts` — Origin auf LAN-IPs erlauben | 10 min |
| A7 | **Dokumentation updaten** | `README.md`, `SETUP.md` — SQLite-Realität + Netzwerk-Setup | 30 min |
| A8 | **Start-Scripts anpassen** | `start_all.bat`, `package.json` — kein Electron mehr | 15 min |

### PHASE B: Diese Woche (Unvollständige Features fixen)

| # | Task | Datei(en) | Aufwand |
|---|------|-----------|---------|
| B1 | **Admin Import implementieren** | `adminRoutes.ts` — Multer für File-Upload (TXT, MD, JSON, CSV) | 2h |
| B2 | **MessageBubble Actions** | `MessageBubble.tsx` — Delete + Save-to-Memory API-Calls | 1h |
| B3 | **Admin Stats echte Werte** | `adminRoutes.ts` — Mock-Werte durch echte Metriken ersetzen oder entfernen | 1h |
| B4 | **Zentrale USER_ID** | Alle 12 Dateien — `default-user` in eine Konstante auslagern | 1h |
| B5 | **Voice STT verbessern** | `voice.ts` — Web Speech API reicht fürs Frontend, Backend-Endpoint dokumentieren | 30 min |
| B6 | **Error Boundaries** | Frontend — React Error Boundaries für alle Views | 1h |

### PHASE C: Nächste Wochen (Stabilisierung)

| # | Task | Beschreibung | Aufwand |
|---|------|-------------|---------|
| C1 | **Unit Tests** | AI Router, Memory Manager, API Routes | 1 Woche |
| C2 | **GitHub Actions CI/CD** | Build + Lint + Test bei jedem Push | 2h |
| C3 | **Zod-Validierung** | API Request/Response Schemas | 1 Tag |
| C4 | **Strukturiertes Logging** | JSON-Format mit Request-IDs | 4h |
| C5 | **Plugin-System echte Implementierung** | `PluginManager.ts` — dynamisches Loading statt Mock | 1 Tag |
| C6 | **Ollama Upgrade** | `gemma3:4b` → `gemma3:12b` (passt in 12 GB VRAM) | 30 min |

### PHASE D: Langfristig (Neue Features)

| # | Task | Beschreibung |
|---|------|-------------|
| D1 | **Auth-System** | Login/Token für Netzwerk-Zugriff (Basic Auth oder JWT) |
| D2 | **HTTPS/TLS** | Verschlüsselte Verbindung im LAN |
| D3 | **Multi-Modell-Routing** | Code → deepseek-coder, Chat → gemma3, Komplex → Claude |
| D4 | **PWA-Manifest** | App-Feeling im Browser, Offline-Support |
| D5 | **Responsive Design** | Mobile-Optimierung für Handy-Zugriff |
| D6 | **Message Actions** | Kopieren, Bearbeiten, Regenerieren |
| D7 | **Dark/Light Theme** | Theme Toggle (aktuell nur Dark) |
| D8 | **Chat-Export** | PDF / Markdown Export |
| D9 | **GPU-Embeddings** | ONNX Runtime + CUDA für schnellere Vektoren |
| D10 | **Monitoring Dashboard** | CPU, RAM, GPU, Token-Usage in Echtzeit |

---

## 10. Projektstruktur (nach Umbau)

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
│   │   │   ├── magicRoutes.ts       # Advanced Features
│   │   │   └── voice.ts             # Voice I/O
│   │   ├── services/                # 35+ Business Logic Services
│   │   │   ├── router/              # AI Routing (5-Stage Orchestrator)
│   │   │   ├── claude/              # Claude API Integration
│   │   │   ├── ollama/              # Ollama/Gemma3 Integration
│   │   │   ├── memory/              # 5-Layer Memory System
│   │   │   │   ├── MemoryManagerService.ts
│   │   │   │   ├── WorkingMemoryService.ts
│   │   │   │   ├── ShortTermMemoryService.ts
│   │   │   │   ├── ImportanceScorer.ts
│   │   │   │   ├── DecayService.ts
│   │   │   │   ├── ExtractionService.ts
│   │   │   │   └── RelationService.ts
│   │   │   ├── search/              # Semantische Suche (ChromaDB)
│   │   │   ├── embeddings/          # Vektor-Generierung (Transformers.js)
│   │   │   ├── learning/            # Lernmodus / Interview
│   │   │   ├── proactive/           # Kontext-Monitoring
│   │   │   ├── plugins/             # Plugin-Manager
│   │   │   ├── skills/              # Skill-Logik (Wetter, etc.)
│   │   │   └── ...                  # Weitere Services
│   │   └── utils/                   # Logger, Helpers, Security
│   ├── prisma/
│   │   └── schema.prisma            # Datenbank-Schema (16 Tabellen)
│   ├── data/                        # Hunspell, Uploads
│   └── package.json
│
├── frontend/                         # React Web-App (KEIN Electron!)
│   ├── src/
│   │   ├── App.tsx                  # Haupt-Komponente
│   │   ├── main.tsx                 # React Entry Point
│   │   ├── components/              # 23+ UI-Komponenten
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── SemanticSearch.tsx
│   │   │   ├── MemoryDashboard.tsx
│   │   │   ├── AdminPanel.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   └── ...
│   │   ├── store/useAppStore.ts     # Zustand State
│   │   ├── services/                # STT, TTS Services
│   │   └── styles/                  # CSS / Tailwind
│   ├── index.html
│   ├── vite.config.ts               # Vite (kein Electron!)
│   └── package.json                 # Keine Electron-Dependency
│
│   ❌ GELÖSCHT: src/main/index.ts   (Electron Main)
│   ❌ GELÖSCHT: src/preload/index.ts (Electron Preload)
│
├── shared/types/index.ts            # Geteilte TypeScript-Typen
├── scripts/                         # Wartungs-Skripte
├── docker/
│   ├── docker-compose.yml           # PostgreSQL + Redis + ChromaDB
│   └── .env.example
├── .github/workflows/ci.yml         # CI/CD Pipeline (TODO)
├── .gitignore
├── KONZEPT_V2.md                    # ← Dieses Dokument
├── README.md
├── SETUP.md
└── package.json                     # Workspace-Root
```

---

## 11. Konfiguration

### 11.1 Backend (.env)

```env
# ── Server ──
NODE_ENV=development
PORT=3001
HOST=0.0.0.0                          # ← Netzwerk-Zugriff (alle Interfaces)

# ── Datenbank ──
DATABASE_URL="file:./prisma/neon.db"   # SQLite (aktuell)
# DATABASE_URL="postgresql://neon:neon@localhost:5432/neon"  # PostgreSQL (optional)

# ── AI Services ──
ANTHROPIC_API_KEY=sk-ant-api03-...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b                # 12B passt in RTX 3060 (12 GB VRAM)

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

### 11.2 Vite Dev-Server (Frontend)

```ts
// frontend/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',     // ← Im Netzwerk erreichbar
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
});
```

### 11.3 Docker Compose

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

## 12. Zugriff & Nutzung

### Development

```bash
# 1. Docker-Services starten (falls PostgreSQL/Redis/ChromaDB gewünscht)
cd docker && docker compose up -d

# 2. Backend + Frontend starten
npm run dev

# 3. Im Browser öffnen:
#    Lokal:    http://localhost:5173
#    Netzwerk: http://192.168.x.x:5173  (von jedem Gerät im LAN)
```

### Production

```bash
# 1. Frontend bauen
cd frontend && npm run build

# 2. Build-Output nach Backend kopieren
# (oder Backend konfigurieren um ../frontend/dist zu servieren)

# 3. Nur Backend starten — serviert alles über Port 3001
cd backend && npm start

# 4. Im Browser öffnen:
#    http://192.168.x.x:3001  (ein Port für alles)
```

---

## 13. Verhaltensregeln (AGENT_RULES)

| Regel | Beschreibung |
|-------|-------------|
| **Memory ≠ Gesprächsthema** | Gespeicherte Fakten werden nicht ungefragt erwähnt |
| **Drittpersonen-Schutz** | Infos über andere Personen werden sensibel behandelt |
| **Sensitive Tags** | `#sensitive`, `#deceased`, `#private` → besondere Vorsicht |
| **Reality Check** | KI kennt ihre Grenzen und gibt das zu |
| **Kein Moral Momentum** | Keine Überreaktionen auf emotionale Inhalte |
| **Privacy Respekt** | Gespeicherte Infos werden nicht proaktiv offengelegt |

---

## 14. Projekt-Statistiken

| Metrik | Wert |
|--------|------|
| Backend Services | 35+ |
| API Endpoints | 70+ |
| UI Komponenten | 23+ |
| Datenbank-Tabellen | 16 |
| Architektur | Monorepo (3 Workspaces) |
| Codezeilen | ~14.000+ |
| Dateien | 130+ |
| Hardcoded `default-user` | 12 Dateien (zu fixen) |
| Platzhalter (501) | 2 Endpoints |
| TODO/FIXME | 4 Stellen |

---

## 15. Roadmap (kompakt)

```
JETZT          Phase A: Electron raus, Netzwerk-Zugriff, Doku fixen
               ──────────────────────────────────────────────────
DIESE WOCHE    Phase B: Admin Import, MessageBubble Actions,
                        Error Boundaries, Voice aufräumen
               ──────────────────────────────────────────────────
NÄCHSTE WOCHEN Phase C: Tests, CI/CD, Zod-Validierung,
                        Plugin-System, Ollama Upgrade (12B)
               ──────────────────────────────────────────────────
LANGFRISTIG    Phase D: Auth, HTTPS, Multi-Modell, PWA,
                        Responsive, Chat-Export, GPU-Embeddings
```

---

> **Dieses Dokument wird fortlaufend aktualisiert.**
> Letzte Änderung: 2026-03-21
> Quellen: Eigene Code-Analyse, Claude-Review, Manus.ai Audit
