# NEON AI Assistant - Setup-Anleitung

## 🚀 Kurz-Setup (Quick Start)

### Voraussetzungen
- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Ollama** ([Download](https://ollama.com/download))

### Installation (5 Schritte)

```powershell
# 1. In Projektverzeichnis wechseln
cd C:\Users\Thorben\.gemini\antigravity\scratch\neon-ai-assistant

# 2. Dependencies installieren
npm install

# 3. Docker Container starten
docker compose up -d

# 4. Datenbank initialisieren
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..

# 5. Ollama Model herunterladen
ollama pull gemma3:4b

# 6. App starten
npm run dev
```

Das wars! 🎉 NEON sollte jetzt auf http://localhost:3001 (Backend) und als Electron App laufen.

---

## 📋 Features-Übersicht

### ✅ Implementiert (Phasen 0-7)

**Phase 0-4: Basis-Infrastruktur**
- ✅ Electron Desktop App mit React & TypeScript
- ✅ Express Backend mit WebSocket (Socket.io)
- ✅ PostgreSQL + Prisma ORM
- ✅ Docker-Setup (PostgreSQL, Redis, ChromaDB)
- ✅ Chat-UI mit Markdown & Syntax-Highlighting

**Phase 5: Semantische Suche** 🔍
- ✅ ChromaDB Vector Database
- ✅ Transformers.js für lokale Embeddings
- ✅ Automatisches Message-Indexing
- ✅ Semantic Search UI (Ctrl+K)
- ✅ REST API für Suche & Reindexing

**Phase 6: Memory System** 🧠
- ✅ 5 Memory-Typen (Working, Short-term, Long-term, Episodic, Semantic)
- ✅ Importance Scoring Algorithm
- ✅ Memory Consolidation (automatisch)
- ✅ Memory Decay über Zeit
- ✅ Context Window Management
- ✅ Memory Retrieval mit Relevanz-Ranking
- ✅ Memory Dashboard UI

**Phase 7: Admin Panel** ⚙️
- ✅ Dokument-Import (TXT, MD, JSON, CSV)
- ✅ Batch-Import von Files
- ✅ Database Reindexing
- ✅ Memory Consolidation Trigger
- ✅ Admin Dashboard UI

### 🚧 Ausstehend (Phasen 8-17)

- Phase 8: Sprach-Input  & Output (Whisper, TTS)
- Phase 9: Proaktive KI
- Phase 10: Lernmodus & Persönlichkeit
- Phase 11: Erweiterte Settings
- Phase 12: Code-Tools
- Phase 13: Plugin-System
- Phase 14: System-Integration
- Phase 15: Performance-Optimierung
- Phase 16: Security & Datenschutz
- Phase 17: Magic Features

---

## 🎯 API Endpoints

### Health & Status
- `GET /api/health` - System health check
- `GET /api/config` - AI router config
- `GET /api/ollama/status` - Ollama status

### Semantic Search
- `GET /api/search?q=query&limit=10` - Semantic search
- `POST /api/search/reindex` - Reindex all messages
- `GET /api/search/stats` - Search statistics

### Memory System
- `POST /api/memory` - Create memory
- `GET /api/memory/:userId` - Get memories
- `GET /api/memory/:userId/search?q=query` - Search memories
- `POST /api/memory/:userId/retrieve` - Retrieve relevant memories
- `POST /api/memory/:userId/context` - Build context window
- `POST /api/memory/:userId/consolidate` - Run consolidation
- `GET /api/memory/:userId/stats` - Memory statistics

### WebSocket Events
- `user-message` - Send message
- `ai-response-chunk` - Receive AI chunk
- `ai-response-complete` - Response complete
- `typing-indicator` - Typing status

---

## 📊 System-Architektur

```
┌─────────────────────────────────────────┐
│         Electron Frontend (React)        │
│  - Chat UI                               │
│  - Semantic Search (Ctrl+K)              │
│  - Memory Dashboard                      │
│  - Admin Panel                           │
└────────────┬────────────────────────────┘
             │ WebSocket + REST
┌────────────┴────────────────────────────┐
│         Express Backend (Node.js)        │
│  - WebSocket Server (Socket.io)          │
│  - AI Router (Claude + Ollama)           │
│  - Memory System                         │
│  - Semantic Search Service               │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┬──────────────────┐
    │                 │                  │
┌───┴────┐   ┌────────┴─────┐   ┌───────┴────┐
│Postgres│   │   ChromaDB    │   │   Ollama   │
│(Prisma)│   │  (Vectors)    │   │  (Llama)   │
└────────┘   └──────────────┘   └────────────┘
```

---

## 🔧 Troubleshooting

### Docker Container starten nicht
```powershell
docker compose down -v
docker compose up -d
```

### Ollama nicht erreichbar
```powershell
ollama list
# Ollama im Task-Manager neu starten
```

### Dependencies fehlen
```powershell
cd backend && npm install
cd ../frontend && npm install
```

### Prisma Fehler
```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
```

---

## 💡 Keyboard Shortcuts

- `Ctrl+K` - Semantic Search öffnen
- `Enter` - Message senden
- `Esc` - Search schließen

---

**Bereit? Starte mit `npm run dev`!** 🚀
