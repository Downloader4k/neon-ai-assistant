import { weatherService } from './WeatherService';
import { logger } from '../../utils/logger';
import { userPreferenceService } from '../db/UserPreferenceService';
import { todoService } from '../db/todoService';
import { shoppingService } from '../db/shoppingService';
import { calendarService } from '../db/calendarService';

export class SkillProcessor {

    /**
     * Analyzes the user message for skill triggers.
     * Returns a context string to be injected into the LLM prompt,
     * AND potentially a hidden data block payload.
     */
    async process(message: string, userId?: string): Promise<{ context: string, payload?: string }> {
        const lowerMsg = message.toLowerCase();
        const currentUserId = userId || 'default-user';

        // --- WEATHER SKILL ---
        if (lowerMsg.includes('wetter') || lowerMsg.includes('temperatur') || lowerMsg.includes('regen') || lowerMsg.includes('sonne') || lowerMsg.includes('vorhersage')) {
            logger.info('SkillProcessor: Detected Weather Intent');
            
            // 1. Get default location from preferences
            const defaultLocation = await userPreferenceService.getPreference(currentUserId, 'location') || 'Berlin';
            let location = defaultLocation;
            
            // 2. Extract location logic
            // Pattern 1: "in <location>" - "Wie ist das Wetter in Berlin?"
            // Pattern 2: "wetter <location>" - "Wetter Berlin" 
            // Pattern 3: "wetterbericht <location>" etc.
            let locationMatch = message.match(/(?:in\s+)([a-zA-ZäöüÄÖÜß\s\-.]+?)(?:\s*[?.,!]|$)/i);
            
            if (!locationMatch) {
                // Try pattern 2: "wetter/temperatur/vorhersage <location>"
                locationMatch = message.match(/(?:wetter|wetterbericht|temperatur|vorhersage|klima)\s+([a-zA-ZäöüÄÖÜß\s\-.]+?)(?:\s*[?.,!]|$)/i);
            }
            
            if (locationMatch && locationMatch[1]) {
                let candidate = locationMatch[1].trim();
                
                // Filter out common filler words
                const fillers = ['bitte', 'danke', 'jetzt', 'heute', 'morgen', 'ist', 'das', 'mir', 'den', 'die', 'wie'];
                if (!fillers.includes(candidate.toLowerCase()) && candidate.length > 2) {
                    location = candidate;
                    // Capitalize each word
                    location = location.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
                }
            } else if (lowerMsg.includes('wohnort') || lowerMsg.includes('hause') || lowerMsg.includes('zu hause')) {
                location = defaultLocation;
            }

            logger.info(`SkillProcessor: DEBUG -> Parsed location: '${location}' (from msg: '${message}')`);

            const weatherData = await weatherService.getWeather(location);
            
            if (weatherData) {
                logger.info(`SkillProcessor: DEBUG -> Weather for '${weatherData.location}': Code ${weatherData.current.code}, Temp ${weatherData.current.temperature}`);
                // Create the hidden payload for the Frontend UI
                const payload = `\n\`\`\`weather\n${JSON.stringify(weatherData, null, 2)}\n\`\`\``;
                
                // Create context for the LLM so it can talk about it
                const context = `
[SYSTEM: WETTER DATEN FÜR ${location}]
Aktuell: ${weatherData.current.temperature}°C, ${weatherData.current.condition}.
Wind: ${weatherData.current.windSpeed} km/h.
Vorhersage:
- Morgen: ${weatherData.forecast[1].tempMin}-${weatherData.forecast[1].tempMax}°C, ${weatherData.forecast[1].condition}
- Übermorgen: ${weatherData.forecast[2].tempMin}-${weatherData.forecast[2].tempMax}°C, ${weatherData.forecast[2].condition}

ANWEISUNG:
Antworte dem Nutzer freundlich mit diesen Daten.
Erwähne kurz das aktuelle Wetter und den Ausblick.
WICHTIG: Erwähne NICHT, dass du eine Karte anzeigst oder erstellt hast. Die Karte erscheint automatisch. Sprich nur über das Wetter.
Du musst KEINE ASCII-Tabellen malen.
`;
                return { context, payload };
            }
        }

        // --- NATURAL LANGUAGE: TODO ERKENNUNG ---
        const nlTodo = this.detectNaturalTodo(lowerMsg);
        if (nlTodo) {
            logger.info(`SkillProcessor: Natural language todo detected: ${nlTodo.action} -> "${nlTodo.text}"`);

            if (nlTodo.action === 'create' && nlTodo.text) {
                const ai = await todoService.aiCategorize(nlTodo.text);
                const todo = await todoService.create({
                    userId: currentUserId,
                    title: nlTodo.text,
                    category: ai.category,
                    priority: ai.priority,
                });
                const payload = `\n\`\`\`todo-created\n${JSON.stringify(todo, null, 2)}\n\`\`\``;
                const context = `
[SYSTEM: TODO ERSTELLT]
Neues Todo wurde erstellt:
- Titel: "${todo.title}"
- Kategorie: ${todo.category} (automatisch erkannt)
- Prioritaet: ${todo.priority}

ANWEISUNG: Bestaetige dem Nutzer freundlich, dass das Todo erstellt wurde. Nenne Titel, Kategorie und Prioritaet. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                return { context, payload };
            }

            if (nlTodo.action === 'list') {
                const todos = await todoService.getAll(currentUserId, { status: 'open' });
                const stats = await todoService.getStats(currentUserId);
                const payload = `\n\`\`\`todo-list\n${JSON.stringify({ todos, stats }, null, 2)}\n\`\`\``;
                const todoSummary = todos.length === 0
                    ? 'Keine offenen Todos vorhanden.'
                    : todos.map((t: any, i: number) => `${i + 1}. [${t.priority}] ${t.title} (${t.category})`).join('\n');
                const context = `
[SYSTEM: TODO LISTE]
Offene Todos (${stats.open} von ${stats.total}):
${todoSummary}

ANWEISUNG: Zeige dem Nutzer seine Todo-Liste freundlich und uebersichtlich. Bleib beim Thema - keine Erinnerungen, Memory-Infos oder andere Themen erwaehnen. Verwende KEINE Code-Blocks.`;
                return { context, payload };
            }

            if (nlTodo.action === 'complete' && nlTodo.text) {
                const todos = await todoService.getAll(currentUserId, { status: 'open' });
                const found = todos.find((t: any) => t.title.toLowerCase().includes(nlTodo.text!.toLowerCase()));
                if (found) {
                    await todoService.complete(found.id);
                    const context = `
[SYSTEM: TODO ABGESCHLOSSEN]
Todo "${found.title}" wurde als erledigt markiert.

ANWEISUNG: Bestaetige dem Nutzer, dass das Todo erledigt ist.`;
                    return { context };
                } else {
                    const context = `
[SYSTEM: TODO NICHT GEFUNDEN]
Kein offenes Todo mit "${nlTodo.text}" gefunden.

ANWEISUNG: Sag dem Nutzer, dass kein passendes Todo gefunden wurde.`;
                    return { context };
                }
            }
        }

        // --- NATURAL LANGUAGE: KALENDER ERKENNUNG ---
        const nlCalendar = this.detectNaturalCalendar(lowerMsg, message);
        if (nlCalendar) {
            logger.info(`SkillProcessor: Natural language calendar detected: ${nlCalendar.action}`);

            if (nlCalendar.action === 'create' && nlCalendar.text) {
                const ai = calendarService.aiCategorize(nlCalendar.text);
                const startDate = nlCalendar.date || new Date();
                const startDateTime = new Date(startDate);
                if (nlCalendar.time) {
                    startDateTime.setHours(nlCalendar.time.hours, nlCalendar.time.minutes, 0, 0);
                }
                const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

                const event = await calendarService.create({
                    userId: currentUserId,
                    title: nlCalendar.text,
                    startDate: startDateTime.toISOString(),
                    endDate: endDateTime.toISOString(),
                    category: ai.category,
                    color: ai.color,
                    location: nlCalendar.location,
                });

                const dateStr = startDateTime.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
                const timeStr = nlCalendar.time ? ` um ${startDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : '';
                const context = `
[SYSTEM: TERMIN ERSTELLT]
Neuer Termin wurde erstellt:
- Titel: "${event.title}"
- Datum: ${dateStr}${timeStr}
- Kategorie: ${ai.category}
${nlCalendar.location ? `- Ort: ${nlCalendar.location}` : ''}

ANWEISUNG: Bestaetige dem Nutzer freundlich, dass der Termin erstellt wurde. Nenne Titel, Datum/Uhrzeit und Kategorie. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                return { context };
            }

            if (nlCalendar.action === 'list') {
                let events;
                let label: string;
                if (nlCalendar.listType === 'today') {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
                    events = await calendarService.getByDateRange(currentUserId, todayStart, todayEnd);
                    label = 'heute';
                } else if (nlCalendar.listType === 'tomorrow') {
                    const tomorrowStart = new Date();
                    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
                    tomorrowStart.setHours(0, 0, 0, 0);
                    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
                    events = await calendarService.getByDateRange(currentUserId, tomorrowStart, tomorrowEnd);
                    label = 'morgen';
                } else if (nlCalendar.listType === 'week') {
                    events = await calendarService.getUpcoming(currentUserId, 7);
                    label = 'diese Woche';
                } else {
                    events = await calendarService.getUpcoming(currentUserId, 30);
                    label = 'die naechsten 30 Tage';
                }

                const stats = await calendarService.getStats(currentUserId);
                const eventSummary = events.length === 0
                    ? 'Keine Termine vorhanden.'
                    : events.map((e: any, i: number) => {
                        const d = new Date(e.startDate);
                        const dateStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                        const timeStr = e.isAllDay ? 'Ganztaegig' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return `${i + 1}. ${dateStr} ${timeStr} - ${e.title} (${e.category})${e.location ? ' @ ' + e.location : ''}`;
                    }).join('\n');

                const context = `
[SYSTEM: TERMINKALENDER]
Termine fuer ${label} (${events.length} Termine, ${stats.today} heute, ${stats.thisWeek} diese Woche):
${eventSummary}

ANWEISUNG: Zeige dem Nutzer seine Termine freundlich und uebersichtlich. Bleib beim Thema - keine Erinnerungen, Memory-Infos oder andere Themen erwaehnen. Verwende KEINE Code-Blocks.`;
                return { context };
            }

            if (nlCalendar.action === 'delete' && nlCalendar.text) {
                const events = await calendarService.getUpcoming(currentUserId, 90);
                const found = events.find((e: any) => e.title.toLowerCase().includes(nlCalendar.text!.toLowerCase()));
                if (found) {
                    await calendarService.delete(found.id);
                    const context = `
[SYSTEM: TERMIN GELOESCHT]
Termin "${found.title}" wurde geloescht.

ANWEISUNG: Bestaetige dem Nutzer kurz, dass der Termin entfernt wurde. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                    return { context };
                } else {
                    const context = `
[SYSTEM: TERMIN NICHT GEFUNDEN]
Kein Termin mit "${nlCalendar.text}" gefunden.

ANWEISUNG: Sag dem Nutzer, dass kein passender Termin gefunden wurde.`;
                    return { context };
                }
            }
        }

        // --- NATURAL LANGUAGE: EINKAUF ERKENNUNG ---
        const nlShopping = this.detectNaturalShopping(lowerMsg, message);
        if (nlShopping) {
            logger.info(`SkillProcessor: Natural language shopping detected: ${nlShopping.action}`);

            if (nlShopping.action === 'add' && nlShopping.items.length > 0) {
                const created = await shoppingService.addItems(currentUserId, nlShopping.items, undefined, nlShopping.explicitStore);
                const payload = `\n\`\`\`shopping-added\n${JSON.stringify(created, null, 2)}\n\`\`\``;
                const hasExplicitStore = nlShopping.explicitStore || created.every((i: any) => i.store);
                const itemSummary = created.map((item: any) =>
                    `- ${item.quantity ? item.quantity + ' ' : ''}${item.name} → ${item.category} (${item.store || 'kein Laden'})`
                ).join('\n');
                const context = `
[SYSTEM: EINKAUFSLISTE AKTUALISIERT]
${created.length} Artikel hinzugefuegt:
${itemSummary}

ANWEISUNG: Bestaetige dem Nutzer freundlich, welche Artikel zur Einkaufsliste hinzugefuegt wurden. Nenne Kategorie und Laden. Bleib beim Thema. Verwende KEINE Code-Blocks.
${!hasExplicitStore ? 'Der Nutzer hat keinen bestimmten Laden genannt. Frag freundlich, in welchem Laden er die Artikel kaufen moechte (Aldi, Lidl, Netto, Edeka, Combi, Selgros, Famila, DM, Fressnapf). Erklaere dass man den Laden mit @ angeben kann, z.B. "Setz Milch auf die Einkaufsliste @Aldi" oder "/einkauf Milch @Lidl".' : ''}`;
                return { context, payload };
            }

            if (nlShopping.action === 'list') {
                const items = await shoppingService.getItems(currentUserId, { isPurchased: false });
                const payload = `\n\`\`\`shopping-list\n${JSON.stringify(items, null, 2)}\n\`\`\``;
                // Nach Laden gruppieren
                const groupedByStore: Record<string, any[]> = {};
                items.forEach((item: any) => {
                    const store = item.store || 'Kein Laden';
                    if (!groupedByStore[store]) groupedByStore[store] = [];
                    groupedByStore[store].push(item);
                });
                const summary = Object.entries(groupedByStore).map(([store, storeItems]) =>
                    `**${store}:**\n${storeItems.map((i: any) => `  - ${i.quantity ? i.quantity + ' ' : ''}${i.name} (${i.category})`).join('\n')}`
                ).join('\n');
                const context = `
[SYSTEM: EINKAUFSLISTE]
${items.length === 0 ? 'Einkaufsliste ist leer.' : `${items.length} Artikel:\n${summary}`}

ANWEISUNG: Zeige dem Nutzer seine Einkaufsliste freundlich sortiert nach Laden. Nenne bei jedem Artikel auch die Kategorie. Bleib beim Thema - keine Erinnerungen, Memory-Infos oder andere Themen erwaehnen. Verwende KEINE Code-Blocks.`;
                return { context, payload };
            }
        }

        // --- TODO SLASH COMMANDS ---
        // /todo <text>        → Neues Todo erstellen
        // /todos              → Alle offenen Todos anzeigen
        // /todo done <text>   → Todo als erledigt markieren
        if (/^\/todo/i.test(message.trim())) {
            logger.info('SkillProcessor: Detected /todo Slash Command');

            const trimmed = message.trim();

            // /todos oder /todo list → Liste anzeigen
            if (/^\/(todos|todo\s+list|todo\s+liste|todo\s+zeig|todo\s+show)\s*$/i.test(trimmed)) {
                const todos = await todoService.getAll(currentUserId, { status: 'open' });
                const stats = await todoService.getStats(currentUserId);
                const payload = `\n\`\`\`todo-list\n${JSON.stringify({ todos, stats }, null, 2)}\n\`\`\``;

                const todoSummary = todos.length === 0
                    ? 'Keine offenen Todos vorhanden.'
                    : todos.map((t: any, i: number) => `${i + 1}. [${t.priority}] ${t.title} (${t.category})`).join('\n');

                const context = `
[SYSTEM: TODO LISTE]
Offene Todos (${stats.open} von ${stats.total}):
${todoSummary}
Ueberfaellig: ${stats.overdue}

ANWEISUNG: Zeige dem Nutzer seine Todo-Liste uebersichtlich. Nutze die Daten oben. Bei keinen Todos, sag freundlich dass alles erledigt ist.`;
                return { context, payload };
            }

            // /todo done <title> → Erledigen
            const doneMatch = trimmed.match(/^\/todo\s+(?:done|erledigt|fertig|check)\s+(.+)/i);
            if (doneMatch) {
                const searchTitle = doneMatch[1].trim().toLowerCase();
                const todos = await todoService.getAll(currentUserId, { status: 'open' });
                const found = todos.find((t: any) => t.title.toLowerCase().includes(searchTitle));
                if (found) {
                    await todoService.complete(found.id);
                    const context = `
[SYSTEM: TODO ABGESCHLOSSEN]
Todo "${found.title}" wurde als erledigt markiert.

ANWEISUNG: Bestaetige dem Nutzer, dass das Todo erledigt ist. Sag etwas Motivierendes.`;
                    return { context };
                } else {
                    const context = `
[SYSTEM: TODO NICHT GEFUNDEN]
Kein offenes Todo mit "${doneMatch[1]}" gefunden.

ANWEISUNG: Sag dem Nutzer, dass kein passendes Todo gefunden wurde. Frag ob er den Titel pruefen moechte.`;
                    return { context };
                }
            }

            // /todo delete <title> → Loeschen
            const deleteMatch = trimmed.match(/^\/todo\s+(?:delete|loeschen|entfern)\s+(.+)/i);
            if (deleteMatch) {
                const searchTitle = deleteMatch[1].trim().toLowerCase();
                const todos = await todoService.getAll(currentUserId);
                const found = todos.find((t: any) => t.title.toLowerCase().includes(searchTitle));
                if (found) {
                    await todoService.delete(found.id);
                    const context = `
[SYSTEM: TODO GELOESCHT]
Todo "${found.title}" wurde geloescht.

ANWEISUNG: Bestaetige dem Nutzer kurz, dass das Todo entfernt wurde.`;
                    return { context };
                }
            }

            // /todo <text> → Neues Todo erstellen (Default)
            const addMatch = trimmed.match(/^\/todo\s+(.+)/i);
            if (addMatch) {
                const title = addMatch[1].trim();
                const ai = await todoService.aiCategorize(title);
                const todo = await todoService.create({
                    userId: currentUserId,
                    title,
                    category: ai.category,
                    priority: ai.priority,
                });
                const payload = `\n\`\`\`todo-created\n${JSON.stringify(todo, null, 2)}\n\`\`\``;
                const context = `
[SYSTEM: TODO ERSTELLT]
Neues Todo wurde erstellt:
- Titel: "${todo.title}"
- Kategorie: ${todo.category} (automatisch erkannt)
- Prioritaet: ${todo.priority}
- ID: ${todo.id}

ANWEISUNG: Bestaetige dem Nutzer freundlich, dass das Todo erstellt wurde. Nenne Titel, Kategorie und Prioritaet. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                return { context, payload };
            }
        }

        // --- KALENDER SLASH COMMANDS ---
        // /termin <text>         → Neuen Termin erstellen
        // /termine               → Naechste Termine anzeigen
        // /termin delete <text>  → Termin loeschen
        if (/^\/(termin|kalender|calendar)/i.test(message.trim())) {
            logger.info('SkillProcessor: Detected /termin Slash Command');
            const trimmed = message.trim();

            // /termine oder /kalender → Liste anzeigen
            if (/^\/(termine|kalender|calendar|termin\s+list|termin\s+zeig)\s*$/i.test(trimmed)) {
                const events = await calendarService.getUpcoming(currentUserId, 14);
                const stats = await calendarService.getStats(currentUserId);
                const eventSummary = events.length === 0
                    ? 'Keine anstehenden Termine.'
                    : events.map((e: any, i: number) => {
                        const d = new Date(e.startDate);
                        const dateStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                        const timeStr = e.isAllDay ? 'Ganztaegig' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return `${i + 1}. ${dateStr} ${timeStr} - ${e.title} (${e.category})`;
                    }).join('\n');
                const context = `
[SYSTEM: TERMINKALENDER]
Naechste Termine (${events.length} anstehend, ${stats.today} heute, ${stats.thisWeek} diese Woche):
${eventSummary}

ANWEISUNG: Zeige dem Nutzer seine Termine uebersichtlich. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                return { context };
            }

            // /termin delete <title> → Loeschen
            const deleteMatch = trimmed.match(/^\/termin\s+(?:delete|loeschen|entfern)\s+(.+)/i);
            if (deleteMatch) {
                const searchTitle = deleteMatch[1].trim().toLowerCase();
                const events = await calendarService.getUpcoming(currentUserId, 90);
                const found = events.find((e: any) => e.title.toLowerCase().includes(searchTitle));
                if (found) {
                    await calendarService.delete(found.id);
                    const context = `
[SYSTEM: TERMIN GELOESCHT]
Termin "${found.title}" wurde geloescht.

ANWEISUNG: Bestaetige dem Nutzer kurz, dass der Termin entfernt wurde.`;
                    return { context };
                }
            }

            // /termin <text> → Neuen Termin erstellen (Default)
            const addMatch = trimmed.match(/^\/termin\s+(.+)/i);
            if (addMatch) {
                const text = addMatch[1].trim();
                const ai = calendarService.aiCategorize(text);
                const parsedDate = calendarService.parseGermanDate(text) || new Date();
                const parsedTime = calendarService.parseGermanTime(text);
                if (parsedTime) {
                    parsedDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
                }
                const endDate = new Date(parsedDate.getTime() + 60 * 60 * 1000);

                const event = await calendarService.create({
                    userId: currentUserId,
                    title: text,
                    startDate: parsedDate.toISOString(),
                    endDate: endDate.toISOString(),
                    category: ai.category,
                    color: ai.color,
                });

                const dateStr = parsedDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
                const timeStr = parsedTime ? ` um ${parsedDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : '';
                const context = `
[SYSTEM: TERMIN ERSTELLT]
Neuer Termin wurde erstellt:
- Titel: "${event.title}"
- Datum: ${dateStr}${timeStr}
- Kategorie: ${ai.category}

ANWEISUNG: Bestaetige dem Nutzer freundlich, dass der Termin erstellt wurde. Nenne Titel, Datum/Uhrzeit und Kategorie. Bleib beim Thema. Verwende KEINE Code-Blocks.`;
                return { context };
            }
        }

        // --- SHOPPING / EINKAUF SLASH COMMANDS ---
        // /einkauf <items>          → Artikel hinzufuegen
        // /einkaufsliste            → Liste anzeigen
        // /einkauf done <item>      → Als gekauft markieren
        // /einkauf clear            → Gekaufte entfernen
        if (/^\/(einkauf|shopping)/i.test(message.trim())) {
            logger.info('SkillProcessor: Detected /einkauf Slash Command');

            const trimmed = message.trim();

            // /einkaufsliste oder /einkauf list → Liste anzeigen
            if (/^\/(einkaufsliste|einkauf\s+list|einkauf\s+liste|einkauf\s+zeig|shopping\s+list|einkauf\s+show)\s*$/i.test(trimmed)) {
                const items = await shoppingService.getItems(currentUserId, { isPurchased: false });
                const payload = `\n\`\`\`shopping-list\n${JSON.stringify(items, null, 2)}\n\`\`\``;

                const grouped: Record<string, any[]> = {};
                items.forEach((item: any) => {
                    if (!grouped[item.category]) grouped[item.category] = [];
                    grouped[item.category].push(item);
                });

                const summary = Object.entries(grouped).map(([cat, catItems]) =>
                    `**${cat}:**\n${catItems.map((i: any) => `  - ${i.quantity ? i.quantity + ' ' : ''}${i.name}${i.store ? ' (' + i.store + ')' : ''}`).join('\n')}`
                ).join('\n');

                const context = `
[SYSTEM: EINKAUFSLISTE]
${items.length === 0 ? 'Einkaufsliste ist leer.' : `${items.length} Artikel:\n${summary}`}

ANWEISUNG: Zeige dem Nutzer seine Einkaufsliste sortiert nach Kategorien. Bei leerer Liste, frag ob er etwas hinzufuegen moechte.`;
                return { context, payload };
            }

            // /einkauf done <item> oder /einkauf gekauft <item>
            const boughtMatch = trimmed.match(/^\/(einkauf|shopping)\s+(?:done|gekauft|check|erledigt)\s+(.+)/i);
            if (boughtMatch) {
                const searchName = boughtMatch[2].trim().toLowerCase();
                const items = await shoppingService.getItems(currentUserId, { isPurchased: false });
                const found = items.find((i: any) => i.name.toLowerCase().includes(searchName));
                if (found) {
                    await shoppingService.togglePurchased(found.id);
                    const context = `
[SYSTEM: ARTIKEL GEKAUFT]
"${found.name}" wurde als gekauft markiert.

ANWEISUNG: Bestaetige dem Nutzer kurz, dass der Artikel abgehakt wurde.`;
                    return { context };
                } else {
                    const context = `
[SYSTEM: ARTIKEL NICHT GEFUNDEN]
Kein offener Artikel mit "${boughtMatch[2]}" gefunden.

ANWEISUNG: Sag dem Nutzer, dass der Artikel nicht auf der Liste steht.`;
                    return { context };
                }
            }

            // /einkauf clear → Gekaufte entfernen
            if (/^\/(einkauf|shopping)\s+clear\s*$/i.test(trimmed)) {
                await shoppingService.clearPurchased(currentUserId);
                const context = `
[SYSTEM: EINKAUFSLISTE AUFGERAEUMT]
Alle gekauften Artikel wurden entfernt.

ANWEISUNG: Bestaetige dem Nutzer, dass die gekauften Artikel entfernt wurden.`;
                return { context };
            }

            // /einkauf <items> [@laden] → Artikel hinzufuegen (Default)
            // Unterstützt: /einkauf Milch, Brot @Aldi  oder  /einkauf Milch, Brot Aldi
            const addMatch = trimmed.match(/^\/(einkauf|shopping)\s+(.+)/i);
            if (addMatch) {
                let itemsText = addMatch[2].trim();

                // Laden-Erkennung: @Aldi, @Lidl etc. am Ende oder inline
                let explicitStore: string | null = null;
                const storeMatch = itemsText.match(/\s*@(aldi|lidl|netto|edeka|combi|selgros|famila|dm|rossmann|rewe|penny|kaufland|fressnapf)\s*$/i);
                if (storeMatch) {
                    explicitStore = storeMatch[1].charAt(0).toUpperCase() + storeMatch[1].slice(1).toLowerCase();
                    itemsText = itemsText.replace(storeMatch[0], '').trim();
                }

                const itemNames = itemsText.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);

                if (itemNames.length > 0) {
                    const created = await shoppingService.addItems(currentUserId, itemNames, undefined, explicitStore);
                    const payload = `\n\`\`\`shopping-added\n${JSON.stringify(created, null, 2)}\n\`\`\``;

                    const itemSummary = created.map((item: any) =>
                        `- ${item.quantity ? item.quantity + ' ' : ''}${item.name} → ${item.category} (${item.store || 'kein Laden'})`
                    ).join('\n');

                    const context = `
[SYSTEM: EINKAUFSLISTE AKTUALISIERT]
${created.length} Artikel hinzugefuegt:
${itemSummary}

ANWEISUNG: Bestaetige dem Nutzer freundlich, welche Artikel zur Einkaufsliste hinzugefuegt wurden. Nenne Kategorie und Laden. Bleib beim Thema. Verwende KEINE Code-Blocks.
Falls der Nutzer keinen Laden angegeben hat, frag freundlich in welchem Laden er die Artikel kaufen moechte.
Verfuegbare Laeden: Aldi, Lidl, Netto, Edeka, Combi, Selgros, Famila, DM, Fressnapf.
Tipp: Man kann den Laden mit @ angeben, z.B. "/einkauf Milch, Brot @Aldi"`;
                    return { context, payload };
                }
            }
        }

        return { context: '' };
    }

    /**
     * Erkennt natuerliche Sprache fuer Todo-Aktionen.
     * Gibt null zurueck wenn keine Todo-Absicht erkannt wird.
     */
    private detectNaturalTodo(lowerMsg: string): { action: 'create' | 'list' | 'complete'; text?: string } | null {
        // Slash-Commands nicht doppelt verarbeiten
        if (lowerMsg.startsWith('/')) return null;

        // --- TODO ANZEIGEN ---
        const listPatterns = [
            /(?:was|welche)\s+(?:sind|steht|habe ich|gibt es)\s+(?:auf|in)\s+(?:meiner?\s+)?(?:todo|aufgaben|to-do)/,
            /(?:zeig|zeige)\s+(?:mir\s+)?(?:meine?\s+)?(?:todos?|aufgaben|to-dos?|aufgabenliste)/,
            /(?:meine?\s+)?(?:todos?|aufgaben|to-dos?|aufgabenliste)\s+(?:anzeigen|zeigen|auflisten|bitte)/,
            /(?:was\s+(?:muss|soll)\s+ich\s+(?:noch\s+)?(?:machen|erledigen|tun))/,
            /(?:offene|aktuelle)\s+(?:todos?|aufgaben)/,
            /(?:welche|habe?\s+ich)\s+(?:noch\s+)?(?:todos?|aufgaben)/,
            /(?:habe?\s+ich\s+(?:noch\s+)?(?:offene\s+)?(?:todos?|aufgaben))/,
            /(?:liste?\s+(?:meiner?\s+)?(?:todos?|aufgaben))/,
            /(?:meine\s+)?(?:todo|aufgaben)(?:liste|-)?\s*(?:anzeigen|zeigen|bitte)?\s*[?]?\s*$/,
            /(?:gibt\s+es\s+(?:noch\s+)?(?:offene\s+)?(?:todos?|aufgaben))/,
            /(?:was\s+(?:steht|liegt|ist)\s+(?:noch\s+)?(?:an|offen))/,
        ];
        for (const p of listPatterns) {
            if (p.test(lowerMsg)) return { action: 'list' };
        }

        // --- TODO ERLEDIGEN ---
        const completePatterns = [
            /(?:ich\s+habe?\s+)["„]?(.+?)[""]?\s+(?:erledigt|geschafft|gemacht|fertig|abgehakt)/,
            /(?:habe?\s+)["„]?(.+?)[""]?\s+(?:erledigt|geschafft|gemacht|fertig)/,
            /["„]?(.+?)[""]?\s+(?:ist\s+(?:erledigt|fertig|geschafft|abgehakt|done))/,
            /(?:markier|hak)\s+["„]?(.+?)[""]?\s+(?:als\s+)?(?:erledigt|fertig|done|ab)/,
        ];
        for (const p of completePatterns) {
            const match = lowerMsg.match(p);
            if (match && match[1] && match[1].length > 2) {
                return { action: 'complete', text: match[1].trim() };
            }
        }

        // --- TODO ERSTELLEN ---
        const createPatterns = [
            /(?:erinner(?:e|)\s+mich\s+(?:an|daran|dass))\s+(.+)/,
            /(?:trag|schreib|setz|pack|nimm)\s+(?:(?:mir\s+)?(?:mal\s+)?)?["„]?(.+?)[""]?\s+(?:auf\s+(?:die|meine)\s+(?:todo|aufgaben|to-do))/,
            /(?:ich\s+muss\s+(?:noch\s+)?(?:unbedingt\s+)?)(.+?)(?:\s*[.!]|$)/,
            /(?:nicht\s+vergessen(?:\s+zu)?)\s+(.+?)(?:\s*[.!]|$)/,
            /(?:merk\s+(?:dir|mir)\s+(?:(?:dass|:)\s+)?(?:ich\s+(?:muss|soll)\s+)?)(.+?)(?:\s*[.!]|$)/,
            /(?:neues?\s+todo|neue\s+aufgabe)(?:\s*:\s*|\s+)(.+)/,
            /(?:todo|aufgabe)\s+(?:erstellen|anlegen|hinzufuegen|hinzufügen)(?:\s*:\s*|\s+)(.+)/,
            /(?:auf\s+(?:die|meine)\s+(?:todo|aufgaben)(?:liste|-)?\s+(?:setzen|schreiben|packen))(?:\s*:\s*|\s+)(.+)/,
            /(?:kannst\s+du\s+(?:mir\s+)?(?:ein(?:en?)?\s+)?(?:todo|aufgabe|erinnerung)\s+(?:erstellen|anlegen|machen)\s*(?::\s*|fuer\s+|für\s+))(.+)/,
        ];
        for (const p of createPatterns) {
            const match = lowerMsg.match(p);
            if (match && match[1]) {
                let text = match[1].trim();
                // Filler am Ende entfernen
                text = text.replace(/\s*(bitte|danke|mal|doch)\s*[.!]?\s*$/i, '').trim();
                if (text.length > 2) {
                    // Capitalize first letter
                    text = text.charAt(0).toUpperCase() + text.slice(1);
                    return { action: 'create', text };
                }
            }
        }

        return null;
    }

    /**
     * Erkennt natuerliche Sprache fuer Einkaufslisten-Aktionen.
     * Gibt null zurueck wenn keine Einkaufs-Absicht erkannt wird.
     */
    private detectNaturalShopping(lowerMsg: string, _originalMsg: string): { action: 'add' | 'list'; items: string[]; explicitStore?: string | null } | null {
        // Slash-Commands nicht doppelt verarbeiten
        if (lowerMsg.startsWith('/')) return null;

        // --- EINKAUFSLISTE ANZEIGEN ---
        const listPatterns = [
            /(?:was|welche)\s+(?:steht|ist|habe ich|gibt es)\s+(?:auf|in)\s+(?:meiner?\s+)?(?:einkauf|einkaufs|shopping)/,
            /(?:zeig|zeige)\s+(?:mir\s+)?(?:meine?\s+)?(?:einkauf|einkaufs|shopping)(?:liste|s?list)/,
            /(?:meine?\s+)?(?:einkauf|einkaufs|shopping)(?:liste|s?list)\s+(?:anzeigen|zeigen|auflisten|bitte)/,
            /(?:was\s+(?:muss|soll)\s+ich\s+(?:noch\s+)?(?:einkaufen|kaufen|besorgen|holen))/,
            /(?:was\s+(?:brauch|brauche)\s+ich\s+(?:noch\s+)?(?:aus\s+dem|im|vom)\s+(?:super|laden|markt|geschäft|geschaeft))/,
            /(?:einkauf|einkaufs|shopping)(?:liste|s?list)\s*(?:anzeigen|zeigen|bitte)?\s*[?]?\s*$/,
            /(?:was\s+(?:steht|ist)\s+(?:noch\s+)?(?:auf|in)\s+(?:der|meiner)\s+(?:liste|einkauf))/,
            /(?:habe?\s+ich\s+(?:noch\s+)?(?:was|etwas|artikel)\s+(?:auf|in)\s+(?:der|meiner)\s+(?:einkauf|einkaufs|shopping))/,
            /(?:welche\s+(?:artikel|sachen|dinge)\s+(?:muss|soll)\s+ich\s+(?:noch\s+)?(?:kaufen|einkaufen|besorgen|holen))/,
            /(?:was\s+(?:steht|ist)\s+(?:auf|in)\s+(?:der|meiner)\s+liste)/,
            /(?:gibt\s+es\s+(?:noch\s+)?(?:was|etwas|artikel)\s+(?:auf|in)\s+(?:der|meiner)\s+(?:einkauf|liste))/,
        ];
        for (const p of listPatterns) {
            if (p.test(lowerMsg)) return { action: 'list', items: [] };
        }

        // --- ARTIKEL HINZUFUEGEN ---
        const addPatterns = [
            /(?:setz|schreib|pack|trag|nimm)\s+(?:(?:mir\s+)?(?:(?:mal|noch|bitte)\s+)*)(.+?)\s+(?:auf\s+(?:die|meine)\s+(?:einkauf|einkaufs|shopping))/,
            /(?:auf\s+(?:die|meine)\s+(?:einkauf|einkaufs|shopping)(?:liste|s?list)\s+(?:setzen|schreiben|packen|tragen))(?:\s*:\s*|\s+)(.+?)(?:\s*[.!]|$)/,
            /(?:ich\s+(?:muss|brauche?|brauch)\s+(?:noch\s+)?)(.+?)\s+(?:kaufen|einkaufen|besorgen|holen|vom\s+(?:super|laden|markt))/,
            /(?:wir\s+(?:brauchen|muessen|müssen)\s+(?:noch\s+)?)(.+?)\s+(?:kaufen|einkaufen|besorgen|holen)/,
            /(?:(?:bitte\s+)?(?:kauf|besorg|hol)\s+(?:mir\s+)?(?:(?:mal|noch|bitte)\s+)*)(.+?)(?:\s+(?:ein|mit|vom|aus|im)|\s*[.!]|$)/,
            /(?:kannst\s+du\s+(.+?)\s+(?:auf\s+(?:die|meine)\s+(?:einkauf|einkaufs|shopping)(?:liste|s?list)\s+(?:setzen|schreiben|packen)))/,
            /(?:fuer|für)\s+(?:die|den|das)\s+(?:einkauf|einkaufs)(?:liste)?\s+(?:brauche?n?\s+(?:wir|ich)\s+(?:noch\s+)?)(.+?)(?:\s*[.!]|$)/,
        ];

        // @Laden Erkennung aus dem gesamten Text
        let explicitStore: string | null = null;
        const storeNames: Record<string, string> = {
            'aldi': 'Aldi', 'lidl': 'Lidl', 'netto': 'Netto', 'edeka': 'Edeka',
            'combi': 'Combi', 'selgros': 'Selgros', 'famila': 'Famila',
            'dm': 'DM', 'rossmann': 'Rossmann', 'rewe': 'Rewe', 'penny': 'Penny',
            'kaufland': 'Kaufland', 'fressnapf': 'Fressnapf',
        };
        const storeInText = lowerMsg.match(/@(aldi|lidl|netto|edeka|combi|selgros|famila|dm|rossmann|rewe|penny|kaufland|fressnapf)/i);
        if (storeInText) {
            explicitStore = storeNames[storeInText[1].toLowerCase()] || null;
        }
        // Auch ohne @: "bei Aldi", "von Lidl", "im Edeka"
        if (!explicitStore) {
            const storePhrase = lowerMsg.match(/(?:bei|von|im|vom|aus dem|beim)\s+(aldi|lidl|netto|edeka|combi|selgros|famila|dm|rossmann|rewe|penny|kaufland|fressnapf)/i);
            if (storePhrase) {
                explicitStore = storeNames[storePhrase[1].toLowerCase()] || null;
            }
        }

        for (const p of addPatterns) {
            const match = lowerMsg.match(p);
            if (match && match[1]) {
                let raw = match[1].trim();
                // @Laden und "bei/von Laden" aus den Items entfernen
                raw = raw.replace(/@\w+/g, '').replace(/\s*(?:bei|von|im|vom|aus dem|beim)\s+(?:aldi|lidl|netto|edeka|combi|selgros|famila|dm|rossmann|rewe|penny|kaufland|fressnapf)\s*/gi, '').trim();
                // Items an Komma, "und", "sowie" splitten
                const items = raw
                    .split(/[,;]+|\s+und\s+|\s+sowie\s+|\s+noch\s+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 1)
                    // Filler entfernen
                    .map(s => s.replace(/^(noch|mal|bitte|auch)\s+/i, '').trim())
                    .filter(s => s.length > 1)
                    // Capitalize
                    .map(s => s.charAt(0).toUpperCase() + s.slice(1));

                if (items.length > 0) {
                    return { action: 'add', items, explicitStore };
                }
            }
        }

        return null;
    }
    /**
     * Erkennt natuerliche Sprache fuer Kalender-Aktionen.
     */
    private detectNaturalCalendar(lowerMsg: string, originalMsg: string): {
        action: 'create' | 'list' | 'delete';
        text?: string;
        date?: Date;
        time?: { hours: number; minutes: number } | null;
        location?: string;
        listType?: 'today' | 'tomorrow' | 'week' | 'upcoming';
    } | null {
        if (lowerMsg.startsWith('/')) return null;

        // --- TERMINE ANZEIGEN ---
        const listPatterns = [
            { pattern: /(?:was\s+(?:habe|hab)\s+ich\s+(?:noch\s+)?(?:heute)\s+(?:vor|an|geplant|anstehen))/, type: 'today' as const },
            { pattern: /(?:was\s+(?:steht|ist)\s+(?:heute)\s+(?:an|auf\s+dem\s+plan))/, type: 'today' as const },
            { pattern: /(?:meine?\s+)?(?:termine?\s+(?:fuer|für)\s+heute|heutige\s+termine)/, type: 'today' as const },
            { pattern: /(?:was\s+(?:habe|hab)\s+ich\s+(?:noch\s+)?(?:morgen)\s+(?:vor|an|geplant|anstehen))/, type: 'tomorrow' as const },
            { pattern: /(?:was\s+(?:steht|ist)\s+(?:morgen)\s+(?:an|auf\s+dem\s+plan))/, type: 'tomorrow' as const },
            { pattern: /(?:meine?\s+)?(?:termine?\s+(?:fuer|für)\s+morgen|morgige\s+termine)/, type: 'tomorrow' as const },
            { pattern: /(?:was\s+(?:habe|hab)\s+ich\s+(?:diese\s+woche|naechste\s+woche|nächste\s+woche)\s+(?:vor|an|geplant))/, type: 'week' as const },
            { pattern: /(?:termine?\s+(?:diese|naechste|nächste)\s+woche)/, type: 'week' as const },
            { pattern: /(?:zeig|zeige)\s+(?:mir\s+)?(?:meine?\s+)?(?:termine|kalender|events?)/, type: 'upcoming' as const },
            { pattern: /(?:meine?\s+)?(?:termine|kalender|events?)\s*(?:anzeigen|zeigen|bitte)?\s*[?]?\s*$/, type: 'upcoming' as const },
            { pattern: /(?:welche|habe?\s+ich)\s+(?:noch\s+)?(?:termine|events?)/, type: 'upcoming' as const },
            { pattern: /(?:gibt\s+es\s+(?:noch\s+)?(?:termine|events?))/, type: 'upcoming' as const },
            { pattern: /(?:was\s+(?:steht|ist)\s+(?:noch\s+)?(?:an|anstehend|geplant))/, type: 'upcoming' as const },
            { pattern: /(?:naechste|nächste)\s+termine/, type: 'upcoming' as const },
        ];
        for (const { pattern, type } of listPatterns) {
            if (pattern.test(lowerMsg)) return { action: 'list', listType: type };
        }

        // --- TERMIN LOESCHEN ---
        const deletePatterns = [
            /(?:loesch|lösch|entfern|streich)\s+(?:den\s+)?(?:termin|event)\s+["„]?(.+?)[""]?(?:\s*[.!]|$)/,
            /(?:termin|event)\s+["„]?(.+?)[""]?\s+(?:loeschen|löschen|entfernen|streichen|absagen)/,
            /(?:sag|sage)\s+(?:den\s+)?(?:termin|event)\s+["„]?(.+?)[""]?\s+ab/,
        ];
        for (const p of deletePatterns) {
            const match = lowerMsg.match(p);
            if (match && match[1] && match[1].length > 2) {
                return { action: 'delete', text: match[1].trim() };
            }
        }

        // --- TERMIN ERSTELLEN ---
        const createPatterns = [
            /(?:ich\s+habe?\s+(?:einen?\s+)?(?:termin|meeting|besprechung|arzttermin))\s+(.+?)(?:\s*[.!]|$)/,
            /(?:trag|schreib|setz|pack)\s+(?:(?:mir\s+)?(?:mal\s+)?)?(?:einen?\s+)?(?:termin|event)\s+(?:ein|auf|in)(?:\s*:\s*|\s+)(.+?)(?:\s*[.!]|$)/,
            /(?:neuen?\s+(?:termin|event|kalender(?:eintrag)?))(?:\s*:\s*|\s+)(.+?)(?:\s*[.!]|$)/,
            /(?:termin|event)\s+(?:erstellen|anlegen|eintragen|hinzufuegen|hinzufügen)(?:\s*:\s*|\s+)(.+?)(?:\s*[.!]|$)/,
            /(?:plane|plan)\s+(?:mir\s+)?(?:einen?\s+)?(.+?)\s+(?:am|auf|fuer|für|ein)(?:\s|$)/,
            /(?:erinner(?:e|)\s+mich\s+an\s+(?:den|meinen?)\s+(?:termin|arzttermin|meeting))\s+(.+?)(?:\s*[.!]|$)/,
            /(?:kannst\s+du\s+(?:mir\s+)?(?:einen?\s+)?(?:termin|event)\s+(?:erstellen|anlegen|eintragen)\s*(?::\s*|fuer\s+|für\s+))(.+?)(?:\s*[.!]|$)/,
        ];
        for (const p of createPatterns) {
            const match = lowerMsg.match(p);
            if (match && match[1]) {
                let text = match[1].trim();
                text = text.replace(/\s*(bitte|danke|mal|doch)\s*[.!]?\s*$/i, '').trim();
                if (text.length > 2) {
                    text = text.charAt(0).toUpperCase() + text.slice(1);

                    // Parse date and time from the text
                    const date = calendarService.parseGermanDate(text) || undefined;
                    const time = calendarService.parseGermanTime(text);

                    // Extract location: "in Berlin", "bei Zahnarzt Mueller"
                    let location: string | undefined;
                    const locMatch = originalMsg.match(/(?:in|bei|im|am|beim)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)/);
                    if (locMatch) {
                        const candidate = locMatch[1].trim();
                        // Avoid matching time/date words
                        const skipWords = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember', 'Uhr'];
                        if (!skipWords.includes(candidate)) {
                            location = candidate;
                        }
                    }

                    return { action: 'create', text, date, time, location };
                }
            }
        }

        return null;
    }
}

export const skillProcessor = new SkillProcessor();
