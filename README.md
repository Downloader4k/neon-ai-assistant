# 🌟 NEON AI Assistant

> **Ein vollständig lokaler, intelligenter KI-Assistent mit Multi-Layer Memory System**

![Status](https://img.shields.io/badge/Status-Phase%207%20Complete-success)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node](https://img.shields.io/badge/Node-20+-green)

NEON ist ein Desktop-basierter AI Assistant, der Claude AI und lokale LLMs (Llama 3.1) kombiniert, um intelligente, kontextbewusste Konversationen mit einem umfassenden Erinnerungssystem zu ermöglichen.

---

## ✨ Features

### 🎯 Core Features (Phasen 0-7)

- **💬 Intelligenter Chat** - Nahtlose Konversation mit KI
- **🧠 Hybrid AI** - Automatisches Routing zwischen Claude (komplex) und Llama (schnell/privat)
- **🔍 Semantische Suche** - Vector-basierte Suche durch alle Nachrichten (Ctrl+K)
- **🧠 Multi-Layer Memory System**
  - Working Memory (Stunden)
  - Short-term Memory (Tage)
  - Long-term Memory (permanent)
  - Episodic Memory (Ereignisse)
  - Semantic Memory (Wissen)
- **📊 Memory Dashboard** - Visualisierung & Management aller Memories
- **⚙️ Admin Panel** - Dokument-Import, Batch-Operationen, Reindexing
- **🎨 Modern UI** - Electron Desktop App mit React, Tailwind & Framer Motion

### 🔧 Technische Highlights

- **Automatische Memory Consolidation** - Intelligentes Zusammenführen ähnlicher Erinnerungen
- **Importance Scoring** - KI-gestütztes Bewerten der Wichtigkeit von Informationen
- **Memory Decay** - Natürliches "Vergessen" unwichtiger Informationen über Zeit
- **Context Window Building** - Automatisches Zusammenstellen relevanter Erinnerungen
- **Real-time WebSocket** - Streaming AI responses
- **Local-First** - Privatsphäre durch lokale Llama-Option

---

## 🚀 Quick Start

### Voraussetzungen

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **Ollama** - [Download](https://ollama.com/download)

### Installation

```powershell
# 1. Projekt klonen / navigieren
cd C:\Users\Thorben\.gemini\antigravity\scratch\neon-ai-assistant

# 2. Dependencies
npm install

# 3. Docker starten
docker compose up -d

# 4. Datenbank
cd backend
npx prisma migrate deploy
npx prisma generate

# 5. Ollama Model
ollama pull gemma3:4b

# 6. Starten!
cd ..
npm run dev
```

Fertig! 🎉 NEON läuft jetzt als Electron App.

---

## 📁 Projektstruktur

```
neon-ai-assistant/
├── backend/                 # Express.js Backend
│   ├── prisma/             # Database schema & migrations
│   ├── src/
│   │   ├── api/            # REST + WebSocket routes
│   │   ├── services/
│   │   │   ├── ai/         # Claude + Ollama integration
│   │   │   ├── router/     # Intelligent AI routing
│   │   │   ├── memory/     # Memory system
│   │   │   ├── search/     # Semantic search
│   │   │   └── chroma/     # ChromaDB integration
│   │   └── utils/          # Logger, helpers
│   └── package.json
│
├── frontend/                # Electron + React App
│   ├── src/
│   │   ├── main/           # Electron main process
│   │   ├── preload/        # Preload scripts
│   │   ├── renderer/       # React UI
│   │   │   ├── components/ # UI components
│   │   │   ├── store/      # Zustand state management
│   │   │   └── styles/     # Tailwind CSS
│   │   └── index.html
│   └── package.json
│
├── shared/                  # Shared types
│   └── types/
│
├── docker-compose.yml       # PostgreSQL, Redis, ChromaDB
├── SETUP.md                 # Detailed setup guide
└── README.md                # This file
```

---

## 🧠 Memory System

NEON's einzigartiges **5-Layer Memory System**:

| Type | Dauer | Verwendung |
|------|-------|------------|
| **Working** | 1-4 Stunden | Aktuelle Konversation |
| **Short-term** | 1-7 Tage | Kürzlich besprochenes |
| **Long-term** | Permanent | Wichtige Informationen |
| **Episodic** | Variabel | Ereignisse & Erlebnisse |
| **Semantic** | Permanent | Fakten & Wissen |

### Importance Scoring

Memories werden automatisch bewertet basierend auf:
- Länge & Komplexität
- Code-Blöcke & Fragen
- Keywords ("wichtig", "merke", etc.)
- User-Feedback
- Zugriffshäufigkeit

### Automatische Consolidation

- **Ähnliche Memories zusammenführen** - Reduziert Redundanz
- **Promotion zu Long-term** - Wichtige Short-term → Long-term
- **Memory Decay** - Unwichtiges vergessen über Zeit
- **Expiration** - Automatisches Ablaufen nach Zeit

---

## 🔌 API Übersicht

### REST Endpoints

```bash
# Health Check
GET /api/health

# Semantic Search
GET /api/search?q=query&limit=10
POST /api/search/reindex

# Memory System
POST /api/memory
GET /api/memory/:userId
POST /api/memory/:userId/retrieve
POST /api/memory/:userId/consolidate
GET /api/memory/:userId/stats

# AI Config
GET /api/config
POST /api/config
```

### WebSocket Events

```typescript
// Client → Server
socket.emit('user-message', { message, conversationId, userId })

// Server → Client
socket.on('ai-response-chunk', ({ chunk, provider }))
socket.on('ai-response-complete', ({ conversationId, provider }))
socket.on('typing-indicator', ({ isTyping }))
```

---

## ⚙️ Konfiguration

### AI Router

Im `.env` (Backend):

```env
# Komplexitätsschwelle (0-1)
# Höher = mehr Claude, Niedriger = mehr Ollama
AI_ROUTER_COMPLEXITY_THRESHOLD=0.6

# Hybrid-Modus (beide vergleichen)
AI_ROUTER_HYBRID_MODE=true

# Privacy-Modus (nur Ollama)
AI_ROUTER_PRIVACY_MODE=false
```

### Claude API Key

Bereits konfiguriert in `backend/.env`:
```env
CLAUDE_API_KEY="sk-ant-api03-..."
```

### Ollama

```powershell
# Model-Liste
ollama list

# Model herunterladen
ollama pull llama3.1:8b

# Laufendes Model
ollama ps
```

---

## 🎨 UI Components

- **ChatInterface** - Hauptchat mit Messages
- **MessageBubble** - Einzelne Message mit Markdown & Syntax-Highlighting
- **ChatInput** - Auto-resize Input mit Enter-to-send
- **SemanticSearch** - Modal für Semantic Search (Ctrl+K)
- **MemoryDashboard** - Memory-Visualisierung & Stats
- **AdminPanel** - Daten-Import & Management

---

## 🛠️ Development

### Backend

```powershell
cd backend
npm run dev        # Development mit nodemon
npm run build      # TypeScript build
npm start          # Production
```

### Frontend

```powershell
cd frontend
npm run dev        # Electron development
npm run build      # Build app
npm run package    # Create distributable
```

### Database

```powershell
cd backend

# Schema bearbeiten
# prisma/schema.prisma

# Migration
npx prisma migrate dev --name beschreibung

# Prisma Studio (Database Browser)
npx prisma studio
```

---

## 📊 Tech Stack

### Frontend
- **Electron** - Desktop framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **Socket.io Client** - WebSocket
- **React Markdown** - MD rendering
- **Highlight.js** - Syntax highlighting

### Backend
- **Node.js** - Runtime
- **Express** - HTTP server
- **Socket.io** - WebSocket
- **TypeScript** - Type safety
- **Prisma** - ORM
- **PostgreSQL** - Main database
- **Redis** - Caching
- **ChromaDB** - Vector database
- **Transformers.js** - Embeddings (lokaler)
- **Anthropic SDK** - Claude AI
- **Ollama** - Local LLM
- **Winston** - Logging

### DevOps
- **Docker** - Container (PostgreSQL, Redis, ChromaDB)
- **Docker Compose** - Orchestration

---

## 🗺️ Roadmap

### ✅ Completed (Phasen 0-7)
- ✅ Phase 0-4: Infrastruktur & Basis-Chat
- ✅ Phase 5: Semantische Suche
- ✅ Phase 6: Memory System
- ✅ Phase 7: Admin Panel & Daten-Import

### 🚧 In Progress
- Phase 8: Sprach-Input & -Output (Whisper, TTS)
- Phase 9: Proaktive KI
- Phase 10: Lernmodus & Persönlichkeit

### 📋 Planned
- Phase 11: Settings & Customization
- Phase 12: Code-Tools & Dev-Features
- Phase 13: Plugin-System
- Phase 14: System-Integration & Automation
- Phase 15: Performance-Optimierung
- Phase 16: Security & Encryption
- Phase 17: Magic Features 🪄

---

## 📖 Dokumentation

- **[SETUP.md](./SETUP.md)** - Detaillierte Setup-Anleitung
- **[task.md](./task.md)** - Implementierungs-Checkliste
- **Backend API** - Siehe `backend/src/api/routes.ts`
- **Prisma Schema** - Siehe `backend/prisma/schema.prisma`

---

## 🤝 Contributing

Dieses Projekt ist aktuell ein privates Entwicklungsprojekt. Weitere Informationen folgen.

---

## 📝 License

MIT License - siehe [LICENSE](./LICENSE)

---

## 🙏 Credits

- **Claude AI** by Anthropic
- **Llama 3.1** by Meta
- **Ollama** - Local LLM Runtime
- **ChromaDB** - Vector Database
- **Transformers.js** - ML in Node.js

---

**Made with ❤️ and AI** 🤖

Bei Fragen oder Problemen siehe [SETUP.md](./SETUP.md) oder erstelle ein Issue.
