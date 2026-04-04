# Test-Anleitung: Alle Features

Alle Tests werden ueber die NEON-Oberflaeche im Browser durchgefuehrt.

## Voraussetzungen

1. Backend starten: `npm run dev:backend`
2. Frontend starten: `npm run dev:frontend`
3. Browser oeffnen: http://localhost:5173

---

## Feature 1: Voice Integration

### Wo finde ich es?
- **Voice Chat Popup**: Sidebar > Voice Chat Button
- **Stimmenauswahl**: Im Voice-Popup oder im Chat-Eingabebereich

### Testen

**Test 1: Voice Chat Popup**
1. Klicke in der Sidebar auf **Voice Chat**
2. Das Popup oeffnet sich mit grossem Mikrofon-Button
3. Klicke den **Mikrofon-Button** zum Aufnehmen
4. Sprich einen Satz, z.B. "Wie wird das Wetter morgen?"
5. Klicke **nochmal** den Mikrofon-Button zum Senden (Walkie-Talkie-Modus)
6. NEON antwortet und liest die Antwort vor

**Test 2: Stimme wechseln**
1. Im Voice-Popup: Oeffne das **Stimmen-Dropdown**
2. Waehle eine andere Stimme (z.B. de-DE-KatjaNeural)
3. Klicke den **Play-Button** neben einer Stimme zum Vorhoeren
4. Stelle NEON eine Frage und hoere die neue Stimme

**Test 3: Auto-Vorlesen im Chat**
1. Aktiviere TTS im normalen Chat (Lautsprecher-Icon)
2. Sende eine Textnachricht
3. NEON sollte die Antwort automatisch vorlesen

---

## Feature 2: Lernender Orchestrator

### Wo finde ich es?
Arbeitet **unsichtbar im Hintergrund** — routet Anfragen zwischen Claude und Ollama.

### Testen

1. Starte verschiedene Chats:
   - Technisch: *"Schreibe eine Python-Funktion fuer Fibonacci"*
   - Wissen: *"Was ist die Hauptstadt von Neuseeland?"*
   - Kreativ: *"Schreibe ein Gedicht ueber den Fruehling"*
2. Der Orchestrator lernt welches Modell fuer welchen Bereich am besten passt
3. Effekt wird nach 10-20 Gespraechen sichtbar

---

## Feature 3: Memory Inspector

### Wo finde ich es?
Sidebar > **Funktionen** > **Memory Inspector**

### Vorbereitung
Fuehre vorher Gespraeche damit Erinnerungen vorhanden sind:
- *"Ich heisse Thorben und wohne in Wiefelstede"*
- *"Bitte antworte mir immer auf Deutsch"*

### Testen

**Timeline** — Erinnerungen nach Tagen gruppiert, Suchleiste zum Filtern
**Heatmap** — Matrix: Wochentage x Erinnerungstypen, Hover fuer Details
**Decay** — Scatter-Plot: Alter vs. Staerke, bedrohte Erinnerungen unter 50%
**Relationen** — Erinnerungen als verknuepfte Karten/Knoten

---

## Feature 4: Skill Marketplace

### Wo finde ich es?
Sidebar > **Funktionen** > **Skill Marketplace**

### Testen

1. **Uebersicht**: 4 vorinstallierte Skills (Wetter, Wissensdatenbank, Web-Suche, Code)
2. **Toggle**: Skills ein-/ausschalten per Schieber
3. **Details**: Auf Skill-Namen klicken fuer Berechtigungen, Trigger, Beschreibung
4. **Bewertung**: 1-5 Sterne vergeben
5. **Filter**: Kategorie-Buttons (lifestyle, knowledge, development, all)
6. **Suche**: Text eingeben filtert in Echtzeit
7. **Installieren**: Plus-Button > Lokaler Ordner oder GitHub
8. **Deinstallieren**: Detail-Ansicht > Deinstallieren (Builtin-Skills sind geschuetzt)

---

## Feature 5: Todos & Einkaufslisten

### Wo finde ich es?
- **UI-Panel**: Sidebar > Funktionen > **Todos & Einkauf**
- **Chat-Commands**: Im Chat `/` tippen fuer Slash-Commands

### Testen

**Test 1: Todo per Chat erstellen**
1. Im Chat tippen: `/todo Arzt anrufen`
2. NEON bestaetigt mit Kategorie (Gesundheit) und Prioritaet (medium)
3. Tippe: `/todo dringend Praesentation fertig machen`
4. Wird als "Arbeit" / "urgent" kategorisiert

**Test 2: Todos anzeigen**
1. Im Chat: `/todos`
2. NEON zeigt alle offenen Todos mit Kategorie und Prioritaet

**Test 3: Todo erledigen**
1. Im Chat: `/todo done Arzt`
2. NEON bestaetigt dass das Todo erledigt ist

**Test 4: Einkaufsliste per Chat**
1. Im Chat: `/einkauf 2x Milch, Brot, 500g Mehl, Zahnpasta`
2. NEON fuegt alle Artikel hinzu mit:
   - Erkannten Mengen (2x, 500g)
   - Automatischen Kategorien (Milchprodukte, Backwaren, Hygiene)
   - Vorgeschlagenen Laeden (Supermarkt, DM)

**Test 5: Einkaufsliste anzeigen**
1. Im Chat: `/einkaufsliste`
2. NEON zeigt alle offenen Artikel sortiert nach Kategorien

**Test 6: Artikel als gekauft markieren**
1. Im Chat: `/einkauf done Milch`
2. Artikel wird als gekauft markiert

**Test 7: UI-Panel**
1. Oeffne Funktionen > **Todos & Einkauf**
2. **Todos-Tab**: Neues Todo eingeben, Filter (Offen/Erledigt/Alle), Kategorie-Dropdown
3. **Einkauf-Tab**: Artikel eingeben (Komma-getrennt), nach Kategorie gruppiert
4. Artikel abhaken, loeschen, "Gekaufte leeren"

**Test 8: Slash-Command-Menue**
1. Im Chat `/` tippen
2. Alle 12 Commands sollten sichtbar sein inkl. /todo, /todos, /einkauf, /einkaufsliste, /listen

---

## Feature 6: Entdecken-Seite

### Wo finde ich es?
Sidebar > **Entdecken** (oder NEON-Logo klicken)

### Testen
1. Begruessungstext ohne Ausrufezeichen
2. Quick-Start-Buttons: Produktivitaet, Lernen, Kreativ, Programmieren
3. Buttons starten einen neuen Chat mit passendem Prompt

---

## Schnell-Checkliste

| Feature | Wo | Test | Erwartet |
|---------|-----|------|----------|
| Voice Chat Popup | Sidebar > Voice Chat | Sprechen + Senden | Walkie-Talkie funktioniert |
| Stimmenauswahl | Voice-Popup > Dropdown | Stimme wechseln + Vorhoeren | Andere Stimme hoerbar |
| Auto-Vorlesen | Chat > TTS-Toggle | Nachricht senden | Antwort wird vorgelesen |
| Orchestrator | Beliebiger Chat | 10+ verschiedene Chats | Laeuft im Hintergrund |
| Memory Timeline | Funktionen > Memory Inspector | Tage aufklappen, suchen | Erinnerungen sichtbar |
| Memory Heatmap | Memory Inspector > Heatmap | Matrix ansehen | Farbige Aktivitaetsmatrix |
| Memory Decay | Memory Inspector > Decay | Graph + Tabelle | Scatter-Plot sichtbar |
| Skill Marketplace | Funktionen > Skill Marketplace | 4 Skills, Toggle, Filter | Alles funktioniert |
| /todo Command | Chat: `/todo Arzt` | Todo wird erstellt | Kategorie + Prioritaet |
| /todos Command | Chat: `/todos` | Liste anzeigen | Offene Todos sichtbar |
| /einkauf Command | Chat: `/einkauf Milch, Brot` | Artikel hinzufuegen | Kategorien erkannt |
| /einkaufsliste | Chat: `/einkaufsliste` | Liste anzeigen | Nach Kategorie sortiert |
| Todos UI-Panel | Funktionen > Todos & Einkauf | Todos Tab | CRUD funktioniert |
| Einkauf UI-Panel | Todos & Einkauf > Einkauf Tab | Artikel hinzufuegen | Gruppiert nach Kategorie |
| Slash-Menue | Chat: `/` tippen | 12 Commands sichtbar | Alle Commands da |
| Entdecken | Sidebar > Entdecken | Startseite | Buttons + Prompts |

---

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Schwarze/leere Seite | Backend laeuft nicht → `npm run dev:backend` |
| Memory Inspector leer | Zuerst Chats fuehren damit Erinnerungen entstehen |
| Skill Store leer | Backend muss laufen |
| Voice Mikrofon geht nicht | Mikrofon-Zugriff im Browser erlauben |
| Keine TTS-Stimme | Backend pruefen, Edge TTS ist automatisch dabei |
| /todo zeigt Fehler | Backend neu starten, `npm run prisma:generate` |
| Slash-Commands fehlen | Hard-Refresh: Ctrl+Shift+R, Vite-Cache loeschen |
| Seite laedt nicht | `rm -rf frontend/node_modules/.vite` + neu starten |
