import { weatherService } from './WeatherService';
import { logger } from '../../utils/logger';
import { userPreferenceService } from '../db/UserPreferenceService';

export class SkillProcessor {
    
    /**
     * Analyzes the user message for skill triggers.
     * Returns a context string to be injected into the LLM prompt, 
     * AND potentially a hidden data block payload.
     */
    async process(message: string): Promise<{ context: string, payload?: string }> {
        const lowerMsg = message.toLowerCase();
        const userId = 'default-user'; // TODO: Pass actual userId

        // --- WEATHER SKILL ---
        if (lowerMsg.includes('wetter') || lowerMsg.includes('temperatur') || lowerMsg.includes('regen') || lowerMsg.includes('sonne') || lowerMsg.includes('vorhersage')) {
            logger.info('SkillProcessor: Detected Weather Intent');
            
            // 1. Get default location from preferences
            const defaultLocation = await userPreferenceService.getPreference(userId, 'location') || 'Berlin';
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

        return { context: '' };
    }
}

export const skillProcessor = new SkillProcessor();
