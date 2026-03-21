# NEON AI Assistant - Vollständiges Konzept & Verbesserungsplan

> **Version:** 2.0 | **Stand:** 2026-03-21 | **Autor:** Thorben / Claude
> **Status:** Phase 1–17 implementiert, Optimierung & Weiterentwicklung geplant

---

## 0. Zielsystem-Hardware

NEON ist optimiert für folgendes System:

| Komponente | Spezifikation | Relevanz für NEON |
|------------|--------------|-------------------|
| **CPU** | AMD Ryzen 7 5700G (8C/16T, 3.8 GHz) | Backend-Services, Embedding-Generierung, Ollama CPU-Fallback |
| **RAM** | 64 GB DDR4-3200 (4x 16GB) | Erlaubt große Modelle + ChromaDB + Electron gleichzeitig |
| **GPU** | NVIDIA GeForce RTX 3060 12GB VRAM | Ollama GPU-Inferenz, CUDA-beschleunigte Embeddings |
| **iGPU** | AMD Radeon (im Ryzen 5700G) | Electron-Rendering, entlastet die RTX für KI |
| **Boot-SSD** | Samsung 970 EVO Plus 1TB (NVMe) | App, Datenbank, ChromaDB — schnelle I/O |
| **Weitere SSDs** | Crucial 240GB (SATA) | Backup/Logs |
| **HDDs** | 3TB + 2x 1TB + 2TB (7TB gesamt) | Archiv, Memory-Backups, Dokument-Indizierung |
| **OS** | Windows 11 Pro | Electron, Docker Desktop, CUDA Support |
| **Mainboard** | MSI B550 (MS-7C56) | PCIe 4.0 für NVMe + GPU |

### Hardware-spezifische Empfehlungen

#### Ollama-Modellwahl (12GB VRAM)

Mit 12GB VRAM + 64GB RAM stehen deutlich größere Modelle zur Verfügung als das aktuell genutzte Gemma 3 4B (nur ~3.3GB VRAM):

| Modell | VRAM-Bedarf | Qualität | Empfehlung |
|--------|-------------|----------|------------|
| Gemma 3 4B (aktuell) | ~3.3 GB | Gut | Schnellste Option, aber verschenkt GPU-Potenzial |
| **Gemma 3 12B** | **~8 GB** | **Sehr gut** | **Empfohlen — beste Balance auf dieser Hardware** |
| Gemma 3 27B (Q4) | ~16 GB (teilweise CPU) | Exzellent | Möglich mit CPU-Offloading (64GB RAM), aber langsamer |
| Llama 3.1 8B | ~5.4 GB | Gut | Gute Alternative, stärker bei Code |
| Qwen 2.5 14B (Q4) | ~10 GB | Sehr gut | Stark bei Reasoning und Code |
| Mistral Small 24B (Q4) | ~14 GB (teil-CPU) | Sehr gut | Mit Offloading nutzbar |
| DeepSeek-R1 14B (Q4) | ~10 GB | Exzellent bei Reasoning | Ideal für komplexe Analyse |

**Empfohlene Konfiguration:**
```env
# Primärmodell: Gemma 3 12B für allgemeine Aufgaben
OLLAMA_MODEL=gemma3:12b

# Optional: Multi-Model-Routing (Zukunft)
OLLAMA_MODEL_FAST=gemma3:4b      # Für einfache Antworten (<1s)
OLLAMA_MODEL_QUALITY=gemma3:12b  # Für komplexe Antworten
OLLAMA_MODEL_REASONING=deepseek-r1:14b  # Für Analyse/Logik
```

#### GPU-Auslastung optimieren

- **CUDA aktivieren:** Ollama nutzt automatisch CUDA, aber sicherstellen dass `CUDA_VISIBLE_DEVICES=0` gesetzt ist (RTX 3060, nicht iGPU)
- **Electron auf iGPU:** Electron-Rendering auf die AMD Radeon iGPU legen, damit die RTX 3060 voll für Ollama verfügbar bleibt
- **GPU Memory Fraction:** Ollama `OLLAMA_GPU_MEMORY_FRACTION=0.9` setzen — 90% der 12GB für das Modell, 10% Puffer

#### RAM-Nutzung (64GB verfügbar)

| Prozess | Empfohlene Zuweisung | Aktuell |
|---------|---------------------|---------|
| Ollama (Modell in RAM/VRAM) | 8–16 GB | ~3.3 GB (verschenkt) |
| Node.js Backend | 2–4 GB | Standard |
| ChromaDB | 2–4 GB | Standard |
| Electron Frontend | 500 MB–1 GB | Standard |
| Transformers.js (Embeddings) | 1–2 GB | Standard |
| Redis Cache | 512 MB | Optional |
| Docker Overhead | 1–2 GB | Standard |
| **Windows + Reserve** | **~30 GB frei** | — |

→ Bei 64GB RAM ist genug Platz, um **zwei Ollama-Modelle gleichzeitig** geladen zu halten (z.B. Gemma 3 4B für schnelle Antworten + 12B für Qualität).

#### Storage-Strategie

| Daten | Empfohlener Speicherort | Begründung |
|-------|------------------------|------------|
| App + Backend | Samsung 970 EVO (NVMe) | Schnellste I/O |
| SQLite/PostgreSQL DB | Samsung 970 EVO (NVMe) | Schnelle Queries |
| ChromaDB Vektoren | Samsung 970 EVO (NVMe) | Schnelle Similarity Search |
| Ollama Modelle | Samsung 970 EVO (NVMe) | Schnelles Laden (~5s statt ~30s von HDD) |
| Application Logs | Crucial 240GB (SATA SSD) | Ausreichend schnell, schont NVMe |
| Memory-Backups | HDD (3TB WD Black) | Große Kapazität, selten gelesen |
| Dokument-Archiv (RAG) | HDD (2TB Seagate) | Große Dateien, sequentielles Lesen |

#### Ollama Performance-Tuning

```env
# Optimiert für RTX 3060 12GB + 64GB RAM
OLLAMA_NUM_GPU=999          # Alle Layer auf GPU (so viele wie passen)
OLLAMA_NUM_THREAD=12        # 12 von 16 Threads für Ollama (Rest für Backend)
OLLAMA_MAX_LOADED_MODELS=2  # Zwei Modelle gleichzeitig geladen halten
OLLAMA_KEEP_ALIVE=30m       # Modell 30 Min im VRAM behalten
OLLAMA_FLASH_ATTENTION=1    # Flash Attention für RTX 3060 (Ampere)
```

#### Node.js Backend-Tuning

```env
# Node.js für 64GB RAM optimieren
NODE_OPTIONS="--max-old-space-size=8192"  # 8GB Heap für Backend
UV_THREADPOOL_SIZE=16                     # Matches CPU-Threads
```

---

## 1. Vision & Zielsetzung

**NEON** ist ein lokal betriebener, intelligenter Desktop-KI-Assistent, der das Beste aus Cloud-KI (Claude) und lokaler KI (Ollama/Gemma 3) vereint. Er soll sich wie ein persönlicher Begleiter anfühlen — mit echtem Gedächtnis, eigener Persönlichkeit und der Fähigkeit, dazuzulernen.

### Kernprinzipien

| Prinzip | Bedeutung |
|---------|-----------|
| **Privacy First** | Persönliche Daten bleiben lokal, Cloud-KI nur bei Bedarf |
| **Kontextbewusstsein** | NEON erinnert sich an Gespräche, Vorlieben und Fakten |
| **Natürliche Interaktion** | Gespräche statt Befehle — Text, Sprache, multimodal |
| **Intelligentes Routing** | Automatische Wahl der besten KI für jede Anfrage |
| **Erweiterbarkeit** | Plugin-System für unbegrenzte Funktionalität |

---

## 2. Architektur-Übersicht

### 2.1 Systemarchitektur

```
┌──────────────────────────────────────────────────────┐
│              ELECTRON DESKTOP APP                     │
│  ┌────────────────────────────────────────────────┐  │
│  │  React 18 + TypeScript + Tailwind + Framer     │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────────┐ │  │
│  │  │ Chat │ │Search│ │Voice │ │Memory Dashboard│ │  │
│  │  └──────┘ └──────┘ └──────┘ └───────────────┘ │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌───────────────┐ │  │
│  │  │Admin │ │Settin│ │Plugin│ │Emotion/Predict│ │  │
│  │  └──────┘ └──────┘ └──────┘ └───────────────┘ │  │
│  └───────────────────┬────────────────────────────┘  │
│                      │ IPC Bridge (Preload)           │
└──────────────────────┼───────────────────────────────┘
                       │ WebSocket + REST
┌──────────────────────┼───────────────────────────────┐
│          EXPRESS BACKEND (Node.js + TS)                │
│  ┌───────────────────┴────────────────────────────┐  │
│  │              5-Stufen AI Router                  │  │
│  │  Domain → Komplexität → Confidence → Depth → Go │  │
│  └───────────┬────────────────────┬───────────────┘  │
│              │                    │                    │
│  ┌───────────┴──┐    ┌───────────┴──────────────┐   │
│  │  Claude API  │    │  Ollama (Gemma 3 4B)      │   │
│  │  (Cloud)     │    │  (Lokal)                  │   │
│  └──────────────┘    └──────────────────────────┘   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  SERVICES (35+)                                  │ │
│  │  Memory • Search • Learning • Proactive • Voice  │ │
│  │  Skills • Plugins • Guardrails • Execution       │ │
│  │  Vision • Web • Currency • Emotion • Predict     │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
  │  SQLite/   │  │ ChromaDB  │  │  Redis    │
  │ PostgreSQL │  │ (Vektoren)│  │  (Cache)  │
  └───────────┘  └───────────┘  └───────────┘
```

### 2.2 Tech-Stack

| Schicht | Technologie | Zweck |
|---------|-------------|-------|
| Desktop | Electron | Rahmenloses Fenster, native Integration |
| Frontend | React 18, Vite, TypeScript | UI-Rendering |
| Styling | Tailwind CSS, Framer Motion | Design & Animationen |
| State | Zustand | Leichtgewichtiges State-Management |
| Echtzeit | Socket.io | Streaming-Antworten, Live-Updates |
| Backend | Express, Node.js, TypeScript | HTTP/WS Server |
| Datenbank | SQLite (Dev) / PostgreSQL (Prod) | Persistenz |
| ORM | Prisma | Typsicherer DB-Zugriff |
| Vektor-DB | ChromaDB | Semantische Suche |
| Embeddings | Transformers.js | Lokale Vektorgenerierung |
| Cloud-KI | Anthropic Claude | Komplexe Aufgaben |
| Lokale KI | Ollama + Gemma 3 4B | Schnelle/private Antworten |
| Logging | Winston | Strukturiertes Logging |
| Security | Helmet, CORS, AES-256 | Absicherung |

---

## 3. Kernfeatures (Implementiert)

### 3.1 Intelligenter Chat

- Streaming-Antworten (Token für Token)
- Markdown-Rendering mit Syntax-Highlighting
- Konversationsverwaltung (erstellen, umbenennen, löschen, pinnen)
- Datei-Upload (Drag & Drop)
- Emoji-Picker
- Typing-Indikator

### 3.2 5-Stufen AI Router

Der Router entscheidet automatisch, welche KI die Anfrage bearbeitet:

```
Stufe 1: Domain-Klassifizierung
  → emotional/persönlich/Gespräch → IMMER Ollama (Identität schützen)
  → Code/Planung/Wissen/Analyse → Weiter

Stufe 2: Komplexitätsbewertung (0–100)
  → Unter Schwelle (70) → Ollama
  → Über Schwelle → Weiter

Stufe 3: Selbstvertrauens-Analyse (0–1)
  → Ollama confident genug (≥0.65) → Ollama
  → Unsicher → Weiter

Stufe 4: Tiefenschwelle
  → Erwartete Tiefe > 0.85 → Claude
  → Sonst → Ollama

Stufe 5: Ausführung
  → Optional: Hybrid-Modus (beide vergleichen)
```

**Design-Entscheidung:** Emotionale/persönliche Domains gehen IMMER an Ollama — das schützt NEONs eigene Identität und verhindert, dass persönliche Inhalte in die Cloud gesendet werden.

### 3.3 5-Schichten Gedächtnissystem

| Schicht | Dauer | Zweck | Beispiel |
|---------|-------|-------|----------|
| **Working Memory** | 1–4 Stunden | Aktive Session | Aktuelles Gesprächsthema |
| **Short-term Memory** | 1–7 Tage | Kürzliche Infos | "Gestern hast du erzählt..." |
| **Long-term Memory** | Permanent | Wichtige Fakten | Geburtstag, Beruf, Vorlieben |
| **Episodic Memory** | Variabel | Ereignisse | "Beim letzten Treffen mit Max..." |
| **Semantic Memory** | Permanent | Strukturiertes Wissen | Konzepte, Zusammenhänge |

**Schlüsselmechanismen:**
- **Importance Scoring** — Bewertet Relevanz nach Keywords, Komplexität, Code-Blöcken, Feedback
- **Automatische Consolidation** — Ähnliche Memories werden zusammengeführt
- **Memory Decay** — Unwichtiges wird natürlich "vergessen"
- **Kritische Daten** — Geburtstage, Bio-Daten haben höchste Priorität und Fallback-Mechanismen
- **Tag-System** — `#sensitive`, `#third_party`, `#deceased`, `#private`, `CRITICAL`

### 3.4 Semantische Suche

- ChromaDB als Vektor-Datenbank
- Transformers.js für lokale Embedding-Generierung (keine API-Calls)
- Ctrl+K für Such-Modal
- Auto-Indexierung neuer Nachrichten
- Adaptiver Threshold je nach Abfragetyp

### 3.5 Voice I/O

- **Speech-to-Text:** Web Speech API + Whisper API
- **Text-to-Speech:** Stimmenauswahl, automatische Ausgabe
- **Audio-Visualisierung** in Echtzeit

### 3.6 Proaktive Intelligenz

- Morgen-Begrüßung (8–10 Uhr)
- Abend-Zusammenfassung (18–20 Uhr)
- Kontext-basierte Vorschläge
- Event-basierte Trigger

### 3.7 Lernmodus & Persönlichkeit

- Interview-Sessions zur Persönlichkeitsentwicklung
- Lernt Präferenzen aus Feedback
- Passt Gesprächsstil an

### 3.8 Erweiterte Features

- **Plugin-System** — Install/Deinstall, Permission-Management
- **Code-Ausführung** — Sandboxed, mit Guardrails
- **Websuche** — Externe Informationsquellen
- **Emotion-Tracking** — Stimmungserkennung & Dashboard
- **Prädiktiver Assistent** — Vorausschauende Vorschläge
- **Time Capsules** — Zeitbasierte Nachrichten
- **Vision** — Bildanalyse
- **Währungsumrechnung** — Live-Kurse

### 3.9 Verhaltensregeln (AGENT_RULES)

- Memory-Fakten sind KEINE Gesprächsthemen (nur auf Nachfrage)
- Third-Party-Filter: Nie proaktiv über andere Personen sprechen
- Sensitivitäts-Tags werden respektiert
- Reality Check: KI kennt ihre Grenzen
- Kein "Moral Momentum" — keine aufgezwungene Empathie

---

## 4. Datenbank-Schema

```
users ─┬─ conversations ─── messages
       ├─ memory_entries ─┬─ memory_embeddings
       │                  ├─ memory_tags
       │                  ├─ memory_relations
       │                  └─ memory_extractions
       ├─ episodes
       ├─ knowledge_entries
       ├─ learning_sessions
       ├─ user_preferences
       ├─ feedback
       └─ proactive_messages

+ api_usage
+ documents
+ plugins
+ system_settings
+ audit_logs
+ emotion_logs
+ time_capsules

Gesamt: 16+ Tabellen
```

---

## 5. API-Übersicht

### REST Endpoints (70+)

| Bereich | Endpoints | Beispiele |
|---------|-----------|-----------|
| Core | `/health`, `/config` | Systemstatus |
| Conversations | CRUD | Erstellen, Listen, Löschen |
| Memory | 6+ | Retrieve, Consolidate, Stats |
| Search | 3+ | Query, Reindex, Stats |
| Admin | 3+ | Import, Reindex, Consolidate |
| Settings | 3+ | Get, Update, User-spezifisch |
| Voice | 3+ | STT, TTS |
| Learning | 4+ | Sessions, Preferences, Personality |
| Plugins | 3+ | List, Toggle, Delete |
| Proactive | 3+ | Pending, Create, Mark |
| Magic | 5+ | Emotions, Predict, TimeCapsule |

### WebSocket Events

| Richtung | Event | Beschreibung |
|----------|-------|-------------|
| Client→Server | `user-message` | Nachricht senden |
| Client→Server | `typing-start/stop` | Tipp-Indikator |
| Server→Client | `ai-response-chunk` | Streaming Token |
| Server→Client | `ai-response-complete` | Antwort fertig |
| Server→Client | `typing-indicator` | KI tippt |
| Server→Client | `error` | Fehlermeldung |

---

## 6. Verbesserungsvorschläge

### 6.1 Performance & Flüssigkeit (Hardware-optimiert)

> Ziel: NEON soll sich **flüssig** anfühlen — erster Token in <500ms, kein Ruckeln, kein Warten.

#### 6.1.1 Ollama-Konfiguration für flüssige Antworten

**Problem:** Gemma 3 4B nutzt nur ~3.3GB der verfügbaren 12GB VRAM. Viel Potenzial verschenkt.

**Lösung für maximale Flüssigkeit:**
```env
# .env - Optimiert für RTX 3060 12GB + 64GB RAM

# Primärmodell: Gemma 3 12B passt komplett in 12GB VRAM
OLLAMA_MODEL=gemma3:12b

# GPU-Optimierung
OLLAMA_NUM_GPU=999              # Alle Layer auf GPU → keine CPU-Bottlenecks
OLLAMA_FLASH_ATTENTION=1        # Flash Attention (Ampere-Architektur RTX 3060)
OLLAMA_KEEP_ALIVE=30m           # Modell 30 Min im VRAM → kein Nachladen
OLLAMA_MAX_LOADED_MODELS=2      # Zwei Modelle gleichzeitig möglich (64GB RAM)

# CPU-Threads (für Offloading-Fälle)
OLLAMA_NUM_THREAD=12            # 12 von 16 Threads (4 bleiben für Backend/System)

# Backend-Tuning
NODE_OPTIONS="--max-old-space-size=8192"  # 8GB Heap
UV_THREADPOOL_SIZE=16                     # Volle Thread-Nutzung
```

**Erwartete Performance (RTX 3060 12GB):**

| Modell | Tokens/Sekunde | Erster Token | VRAM | Empfehlung |
|--------|---------------|-------------|------|------------|
| Gemma 3 4B | ~60-80 t/s | ~200ms | 3.3 GB | Zu klein — verschenkt Potenzial |
| **Gemma 3 12B** | **~25-35 t/s** | **~400ms** | **~8 GB** | **Optimal — flüssig & qualitativ** |
| Qwen 2.5 14B Q4 | ~20-30 t/s | ~500ms | ~10 GB | Gute Alternative |
| Gemma 3 27B Q4 | ~8-12 t/s | ~1.5s | ~16 GB (teil-CPU) | Zu langsam für Flüssigkeit |

**Dual-Model-Strategie für beste Flüssigkeit:**
```
Einfache Fragen (Smalltalk, kurze Antworten):
  → Gemma 3 4B (bereits im RAM, ~80 t/s, sofortige Antwort)

Komplexe Fragen (Analyse, Code, Erklärungen):
  → Gemma 3 12B (~30 t/s, trotzdem flüssig streamed)

Sehr komplexe Aufgaben:
  → Claude API (Streaming, kein VRAM-Verbrauch)
```

#### 6.1.2 Electron auf iGPU für flüssiges UI

**Problem:** Electron und Ollama konkurrieren um GPU-Ressourcen auf der RTX 3060.

**Lösung:**
```
# Electron Startparameter (main/index.ts)
app.commandLine.appendSwitch('--gpu-preference', 'integrated')
# Oder Windows-Einstellung:
# Windows → Grafik-Einstellungen → neon-ai-assistant.exe → "Energiesparmodus" (= iGPU)
```
→ Electron rendert auf der AMD Radeon iGPU, RTX 3060 ist **100% frei für Ollama**

#### 6.1.3 Connection Resilience
**Problem:** WebSocket-Verbindungen können bei Backend-Neustarts abbrechen.
**Verbesserung:**
- Exponential Backoff bei Reconnect (statt fester Intervalle)
- Offline-Queue: Nachrichten puffern und nach Reconnect senden
- Health-Check-Ping alle 30 Sekunden
- Visuelle Anzeige des Verbindungsstatus im UI

#### 6.1.4 Response Streaming optimieren
**Problem:** Streaming-Chunks können bei hoher Last ruckeln.
**Verbesserung:**
- Token-Buffering: 3-5 Tokens sammeln, dann als Batch senden (glatterer Text-Fluss)
- `requestAnimationFrame` für DOM-Updates statt sofortiges Rendering jedes Tokens
- Virtualisiertes Scrolling für lange Konversationen (react-virtuoso)
- CSS `content-visibility: auto` für nicht-sichtbare Messages

#### 6.1.5 Lazy Loading & Code Splitting
**Problem:** Alle Komponenten werden initial geladen.
**Verbesserung:**
- React.lazy() für Admin, Settings, Memory Dashboard, Emotion Dashboard
- Route-basiertes Code Splitting
- Suspense-Boundaries mit Skeleton-Loadern

#### 6.1.6 Database auf NVMe halten
**Problem:** DB-Queries werden langsam wenn Daten auf HDD liegen.
**Verbesserung:**
- SQLite-Datei, ChromaDB-Daten und Ollama-Modelle auf Samsung 970 EVO (NVMe)
- Logs auf Crucial SSD auslagern (reicht für sequentielles Schreiben)
- Memory-Backups automatisch auf 3TB HDD (Cron-Job, z.B. täglich 3 Uhr)
- Indizes auf häufig abgefragte DB-Felder (userId, createdAt, importance)
- Pagination für Memory-Listen
- Connection Pooling konfigurieren (Prisma)

---

### 6.2 KI-Routing & Qualität

#### 6.2.1 Dynamische Schwellenwerte
**Problem:** Statische Thresholds passen nicht für alle Szenarien.
**Verbesserung:**
- **Lernende Thresholds:** Basierend auf User-Feedback (Daumen hoch/runter) automatisch anpassen
- Tracking: Welcher Provider lieferte bei welcher Domain bessere Antworten?
- A/B-Testing: Gelegentlich beide Provider vergleichen und Ergebnisse loggen
- Dashboard zur Visualisierung der Routing-Statistiken

#### 6.2.2 Fallback-Kaskade verbessern
**Problem:** Wenn Ollama oder Claude ausfällt, fehlt ein robustes Fallback.
**Verbesserung:**
```
Primär: Konfigurierter Provider
  ↓ Fehler/Timeout
Sekundär: Alternativer Provider
  ↓ Fehler/Timeout
Tertiär: Gecachte ähnliche Antwort
  ↓ Nicht verfügbar
Fallback: Freundliche Fehlermeldung mit Retry-Option
```

#### 6.2.3 Kontext-Window-Management
**Problem:** Bei langen Gesprächen wird der Kontext zu groß oder relevante Infos gehen verloren.
**Verbesserung:**
- Sliding Window mit intelligentem Summarizing alter Nachrichten
- Priorisierung: Aktuelle Nachricht > relevante Memories > Gesprächshistorie
- Token-Budget pro Kategorie (z.B. 40% Konversation, 30% Memory, 30% System)
- Warnung an User wenn Kontext-Limit naht

#### 6.2.4 Multi-Model Support (Hardware: 12GB VRAM + 64GB RAM)
**Problem:** Aktuell nur Gemma 3 4B als lokales Modell — verschenkt 9GB VRAM.
**Verbesserung:**
- **Dual-Model-Routing:** Gemma 3 4B (schnell, ~80 t/s) + Gemma 3 12B (Qualität, ~30 t/s)
- Beide Modelle gleichzeitig im Speicher halten (4B im RAM, 12B auf GPU) → kein Ladezeit-Overhead
- Automatische Wahl: Einfache Fragen → 4B (instant), komplexe → 12B (flüssig), sehr komplex → Claude
- Modell-Wechsel über Settings-UI
- Benchmarking-Tool: Antwortzeit + Qualitäts-Score pro Modell loggen
- Optional: DeepSeek-R1 14B für Reasoning-Tasks (passt in 12GB VRAM als Q4)

---

### 6.3 Gedächtnissystem

#### 6.3.1 Knowledge Graph
**Problem:** Memories sind flach gespeichert, Beziehungen zwischen Informationen gehen verloren.
**Verbesserung:**
- Visuelle Knowledge-Graph-Darstellung im Frontend (D3.js oder Cytoscape.js)
- Automatische Relation-Erkennung (Personen ↔ Orte ↔ Events)
- Graph-Traversierung für kontextuelles Retrieval
- Cluster-Erkennung für Themenzusammenfassung

#### 6.3.2 Memory-Versionierung
**Problem:** Wenn sich Fakten ändern (z.B. neuer Job), wird die alte Version überschrieben.
**Verbesserung:**
- Versioniertes Memory: Alte Versionen behalten, aber als "outdated" markieren
- Changelog für wichtige Faktenänderungen
- "Seit wann"-Information (z.B. "Thorben arbeitet seit März 2026 bei Firma X")

#### 6.3.3 Intelligenterer Importance Score
**Problem:** Score basiert hauptsächlich auf Keywords und Textmerkmalen.
**Verbesserung:**
- **Temporaler Boost:** Kürzlich häufig abgerufene Memories höher bewerten
- **Soziale Relevanz:** Informationen über enge Kontakte höher bewerten
- **Wiederholungs-Signal:** Wenn User etwas mehrmals erwähnt → Wichtigkeit erhöhen
- **Explizite Markierung:** "Merk dir das" → sofort Importance 1.0

#### 6.3.4 Memory-Export & -Import
**Problem:** Kein Weg, Memories zu sichern oder zwischen Instanzen zu übertragen.
**Verbesserung:**
- Export als JSON/Markdown
- Import mit Duplikat-Erkennung
- Selective Export (nach Kategorie, Zeitraum, Person)
- Backup-Automatisierung

---

### 6.4 User Experience

#### 6.4.1 Conversation Branching
**Problem:** Lineare Gespräche — keine Möglichkeit, alternative Antworten zu erkunden.
**Verbesserung:**
- "Regenerate Response" Button
- Branch-Ansicht: Verschiedene Gesprächsverläufe ab einem Punkt
- Favorisierte Antworten markieren

#### 6.4.2 Rich Message Types
**Problem:** Nachrichten sind nur Text + Markdown.
**Verbesserung:**
- **Interaktive Karten:** Wetter, Kalender, Aufgaben
- **Inline-Diagramme:** Mermaid.js für Flowcharts und Sequenzdiagramme
- **Tabellen mit Sortierung/Filterung**
- **Code-Runner:** Inline-Ausführung mit Ergebnis-Anzeige
- **Umfragen/Polls:** Schnelle Entscheidungshilfe

#### 6.4.3 Themes & Personalisierung
**Problem:** Nur ein Dark Theme verfügbar.
**Verbesserung:**
- Light Theme, OLED Dark Theme, System-Preference
- Akzentfarbe anpassbar
- Font-Größe und Font-Familie wählbar
- Chat-Bubble-Stil (rund, eckig, minimal)
- Custom CSS-Injection für Power-User

#### 6.4.4 Keyboard-First Navigation
**Problem:** Viele Features nur per Maus erreichbar.
**Verbesserung:**
- Command Palette (Ctrl+P) für alle Aktionen
- Vim-ähnliche Navigation (optional)
- Keyboard Shortcuts für häufige Aktionen:
  - `Ctrl+K` — Suche (existiert)
  - `Ctrl+N` — Neue Konversation
  - `Ctrl+,` — Settings
  - `Ctrl+M` — Memory Dashboard
  - `Ctrl+1-9` — Schnell zwischen Konversationen wechseln
  - `Esc` — Panel schließen

#### 6.4.5 Mobile Companion App
**Problem:** NEON ist nur am Desktop nutzbar.
**Verbesserung (Langfristig):**
- PWA oder React Native App
- Sync über lokales Netzwerk (kein Cloud-Server nötig)
- Kompakte Chat-Ansicht für unterwegs
- Push-Notifications für proaktive Nachrichten

---

### 6.5 Sicherheit & Privacy

#### 6.5.1 End-to-End Verschlüsselung
**Problem:** Daten sind zwar lokal, aber nicht vollständig verschlüsselt.
**Verbesserung:**
- SQLite-Verschlüsselung mit SQLCipher
- Verschlüsselter Memory-Cache auf Disk
- Master-Passwort beim App-Start (optional)
- Automatische Bildschirmsperre nach Inaktivität

#### 6.5.2 Audit-Trail Verbesserung
**Problem:** Audit-Logs existieren, aber sind schwer auswertbar.
**Verbesserung:**
- Filterbares Audit-Log im Admin Panel
- Automatische Alerts bei ungewöhnlichen Mustern
- Export als CSV/JSON für externe Analyse
- Retention Policy (automatisches Löschen nach X Tagen)

#### 6.5.3 Daten-Hoheit
**Problem:** Kein klarer Überblick, welche Daten an Claude gesendet werden.
**Verbesserung:**
- **Transparenz-Dashboard:** Zeigt genau, was an die Cloud gesendet wurde
- **Redaction-Layer:** Automatisches Maskieren von PII vor Cloud-Calls
- **Opt-In pro Konversation:** "Diese Konversation nur lokal" Toggle
- **Datenexport:** DSGVO-konformer Export aller gespeicherten Daten

---

### 6.6 Entwicklung & Wartung

#### 6.6.1 Testing
**Problem:** Keine Tests vorhanden.
**Verbesserung:**
- **Unit Tests:** Jest/Vitest für Services (Memory, Router, Search)
- **Integration Tests:** API-Endpoints mit Supertest
- **E2E Tests:** Playwright für kritische User-Flows
- **Test-Coverage:** Minimum 70% für kritische Services
- **CI/CD:** GitHub Actions Pipeline

#### 6.6.2 Monitoring & Observability
**Problem:** Nur File-basiertes Logging.
**Verbesserung:**
- Structured Logging mit Correlation IDs
- Metriken: Response-Zeiten, Token-Verbrauch, Memory-Größe
- Health-Dashboard im Admin Panel
- Alerting bei Fehlern (lokale Notifications)

#### 6.6.3 Electron Packaging
**Problem:** Noch kein .exe-Build.
**Verbesserung:**
- Electron Builder Konfiguration
- Auto-Update Mechanismus (electron-updater)
- Installer für Windows (.exe / .msi)
- Portable Version (kein Install nötig)
- Tray-Icon mit Quick-Actions

#### 6.6.4 Dokumentation
**Problem:** Mehrere MD-Dateien mit teilweise widersprüchlichen/veralteten Infos.
**Verbesserung:**
- Konsolidierung in eine strukturierte Dokumentation
- API-Dokumentation mit Swagger/OpenAPI
- Inline-Code-Dokumentation (JSDoc) für kritische Services
- Changelog pflegen

---

### 6.7 Neue Feature-Ideen

#### 6.7.1 Konversations-Zusammenfassungen
- Automatische Zusammenfassung langer Gespräche
- "Was haben wir letzte Woche besprochen?" Feature
- Exportierbare Meeting-Notes

#### 6.7.2 Aufgaben-Management
- Inline-Aufgaben erstellen aus Gesprächen ("Merk dir, dass ich X machen muss")
- Aufgaben-Liste mit Prioritäten und Deadlines
- Erinnerungen für offene Aufgaben
- Integration mit proaktivem System

#### 6.7.3 Multi-User Support
- Verschiedene Profile (privat, Arbeit)
- Getrennte Memories pro Profil
- Profil-spezifische Settings und KI-Persönlichkeit

#### 6.7.4 RAG (Retrieval-Augmented Generation)
- Lokale Dokumente als Wissensquelle indizieren
- PDF, DOCX, TXT automatisch verarbeiten
- "Frag meine Dokumente" Modus
- Quellenangaben in Antworten

#### 6.7.5 Automatisierung & Workflows
- "Wenn X, dann Y" Regeln definieren
- Geplante Aufgaben (Cron-artig)
- Workflow-Ketten: Suche → Analyse → Zusammenfassung → Notification
- Integration mit lokalen Tools (Dateisystem, Browser, Kalender)

#### 6.7.6 Collaborative Mode
- Geteilte Konversationen (z.B. für Team-Brainstorming)
- Rollen-basierter Zugriff
- Export als Präsentation oder Dokument

---

## 7. Priorisierte Roadmap

### Phase A: Stabilität & Qualität (Priorität: HOCH)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| A1 | Unit & Integration Tests | Mittel | Sehr hoch |
| A2 | Connection Resilience (Reconnect, Offline-Queue) | Gering | Hoch |
| A3 | Dokumentation konsolidieren | Gering | Mittel |
| A4 | Electron Packaging (.exe) | Mittel | Hoch |
| A5 | DB Query Optimization & Indizes | Gering | Mittel |

### Phase B: UX & Usability (Priorität: HOCH)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| B1 | Command Palette (Ctrl+P) | Gering | Hoch |
| B2 | Regenerate Response | Gering | Mittel |
| B3 | Keyboard Shortcuts erweitern | Gering | Mittel |
| B4 | Konversations-Zusammenfassungen | Mittel | Hoch |
| B5 | Themes (Light, OLED Dark) | Mittel | Mittel |

### Phase C: KI-Verbesserungen (Priorität: MITTEL)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| C1 | Lernende Thresholds (Feedback-Loop) | Mittel | Hoch |
| C2 | Kontext-Window-Management verbessern | Mittel | Hoch |
| C3 | Multi-Model Support | Mittel | Mittel |
| C4 | Semantisches Response-Caching | Mittel | Mittel |
| C5 | RAG für lokale Dokumente | Hoch | Sehr hoch |

### Phase D: Memory-Verbesserungen (Priorität: MITTEL)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| D1 | Knowledge Graph Visualisierung | Hoch | Hoch |
| D2 | Memory-Versionierung | Mittel | Mittel |
| D3 | Memory-Export/Import | Gering | Mittel |
| D4 | Intelligenterer Importance Score | Mittel | Hoch |

### Phase E: Sicherheit (Priorität: MITTEL)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| E1 | PII-Redaction vor Cloud-Calls | Mittel | Sehr hoch |
| E2 | Transparenz-Dashboard | Mittel | Hoch |
| E3 | SQLite-Verschlüsselung | Gering | Mittel |
| E4 | Opt-In "Nur Lokal" pro Konversation | Gering | Hoch |

### Phase F: Neue Features (Priorität: NIEDRIG)

| # | Feature | Aufwand | Impact |
|---|---------|---------|--------|
| F1 | Aufgaben-Management | Mittel | Hoch |
| F2 | Inline Mermaid.js Diagramme | Gering | Mittel |
| F3 | Multi-User / Profile | Hoch | Mittel |
| F4 | Automatisierung & Workflows | Hoch | Hoch |
| F5 | Mobile Companion (PWA) | Sehr hoch | Hoch |

---

## 8. Technische Schulden

Bekannte Issues, die angegangen werden sollten:

| Issue | Schwere | Beschreibung |
|-------|---------|-------------|
| Keine Tests | Hoch | Kein einziger Unit- oder Integrationstest |
| Veraltete Docs | Mittel | README zeigt "Phase 7 Complete", COMPLETE.md zeigt "Phase 17" |
| Hardcoded Values | Mittel | Einige Werte im AIRouter sind hardcoded statt konfigurierbar |
| Kein Error Boundary | Mittel | React-Fehler können die gesamte App crashen |
| Kein Rate Limiting auf WS | Mittel | WebSocket-Nachrichten sind nicht rate-limited |
| Memory-Duplikate | Gering | Trotz Deduplizierung können ähnliche Memories entstehen |
| Inkonsistente .env | Gering | README und tatsächliche .env-Variablen stimmen nicht überein |

---

## 9. Metriken & Erfolgskriterien

### Qualitätsmetriken (Zielwerte für Ryzen 7 5700G + RTX 3060 12GB)

| Metrik | Aktuell | Ziel | Hardware-Hinweis |
|--------|---------|------|-----------------|
| Test-Coverage | 0% | 70%+ | — |
| Antwortzeit Gemma 3 4B | ~2-5s (voll) | <1s (erster Token ~200ms) | GPU-only, Flash Attention |
| Antwortzeit Gemma 3 12B | nicht getestet | <2s (erster Token ~400ms) | Passt komplett in 12GB VRAM |
| Tokens/Sekunde (4B) | ~40-50 t/s | ~60-80 t/s | OLLAMA_NUM_GPU=999 |
| Tokens/Sekunde (12B) | — | ~25-35 t/s | Flash Attention aktiviert |
| Memory-Retrieval Accuracy | ~80% | 95%+ | ChromaDB auf NVMe |
| Embedding-Generierung | ~500ms | <300ms | Transformers.js + CUDA |
| Uptime (ohne Crash) | Unbekannt | 99%+ | Error Boundaries |
| Claude-Nutzung (Cost) | Unbekannt | Tracking aktiv | Nur bei Depth >0.85 |
| VRAM-Auslastung | ~3.3GB / 12GB | ~8-10GB / 12GB | Gemma 12B optimal |
| RAM-Auslastung | ~6GB / 64GB | ~15-20GB / 64GB | Modelle + DB + Cache |

### User-Experience-Metriken (Flüssigkeitsziele)

| Metrik | Ziel | Wie erreichen |
|--------|------|--------------|
| Time to First Token (Ollama) | <400ms | Modell im VRAM halten (KEEP_ALIVE=30m) |
| Time to First Token (Claude) | <800ms | Streaming API |
| UI-Framerate beim Streaming | 60fps | Electron auf iGPU, Token-Batching |
| App-Startzeit | <3s | Lazy Loading, Code Splitting |
| Suchgeschwindigkeit (Ctrl+K) | <200ms | ChromaDB auf NVMe, Indizes |
| Konversationswechsel | <100ms | Zustand Store, keine DB-Wartezeit |
| Korrekte Routing-Entscheidung | >90% | Lernende Thresholds |
| Memory-Recall bei direkter Frage | 100% | Kritische-Daten-System |
| Zufriedenheit mit Antwortqualität | >85% | Feedback-Tracking |

---

## 10. Zusammenfassung

NEON ist bereits ein beeindruckend umfangreicher KI-Assistent mit 17 implementierten Feature-Phasen. Die wichtigsten nächsten Schritte sind:

1. **Stabilität sichern** — Tests, Error Boundaries, Reconnect-Logik
2. **User Experience verfeinern** — Command Palette, Keyboard Navigation, Themes
3. **KI-Qualität verbessern** — Lernende Thresholds, besseres Kontext-Management
4. **Privacy stärken** — PII-Redaction, Transparenz-Dashboard
5. **Packaging** — .exe-Build für einfache Distribution

Der Fokus sollte auf Qualität vor Quantität liegen — die Feature-Basis ist stark, jetzt geht es darum, sie robust und poliert zu machen.

---

*Dieses Konzept dient als lebendiges Dokument und sollte regelmäßig aktualisiert werden.*
