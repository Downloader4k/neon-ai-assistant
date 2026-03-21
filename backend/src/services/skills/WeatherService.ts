import axios from 'axios';

export interface WeatherData {
    location: string;
    current: {
        temperature: number;
        condition: string;
        code: number;
        windSpeed: number;
    };
    forecast: Array<{
        day: string;
        tempMax: number;
        tempMin: number;
        code: number;
        condition: string;
    }>;
}

export class WeatherService {
    private static GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
    private static WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

    // City name aliases for ambiguous searches (Open-Meteo has issues with some city names)
    private static CITY_ALIASES: Record<string, string> = {
        "new york": "New York City",
        "nyc": "New York City",
        "la": "Los Angeles",
        "los angeles": "Los Angeles",
        "sf": "San Francisco",
        "san fran": "San Francisco",
        "dc": "Washington",
        "washington": "Washington",
        "london": "London",
        "paris": "Paris",
        "berlin": "Berlin",
        "tokyo": "Tokyo",
        "tokio": "Tokyo"
    };

    private static getWeatherCondition(code: number): string {
        if (code === 0) return 'Klar';
        if (code === 1 || code === 2 || code === 3) return 'Bewölkt';
        if (code === 45 || code === 48) return 'Nebel';
        if (code >= 51 && code <= 55) return 'Nieselregen';
        if (code >= 61 && code <= 67) return 'Regen';
        if (code >= 71 && code <= 77) return 'Schnee';
        if (code >= 80 && code <= 82) return 'Regenschauer';
        if (code >= 95) return 'Gewitter';
        return 'Unbekannt';
    }

    async getWeather(locationName: string): Promise<WeatherData | null> {
        try {
            console.log(`[WeatherService] Fetching weather for "${locationName}"`);

            // Normalize location name using aliases
            const normalizedLocation = WeatherService.CITY_ALIASES[locationName.toLowerCase().trim()] || locationName;
            if (normalizedLocation !== locationName) {
                console.log(`[WeatherService] Alias matched: "${locationName}" -> "${normalizedLocation}"`);
            }

            // 1. Geocoding
            // encodeURIComponent is crucial for city names with spaces
            const geoUrl = `${WeatherService.GEOCODING_API}?name=${encodeURIComponent(normalizedLocation)}&count=5&language=de&format=json`;
            const geoRes = await axios.get(geoUrl);
            const geoData = geoRes.data;

            if (!geoData.results || geoData.results.length === 0) {
                console.error(`[WeatherService] Location "${normalizedLocation}" not found.`);
                return null;
            }

            // Sort by population (desc) to find major cities first
            // This fixes "York" (Nebraska) appearing before "New York"
            const sortedResults = geoData.results.sort((a: any, b: any) => (b.population || 0) - (a.population || 0));
            const bestResult = sortedResults[0];

            console.log(`[WeatherService] Found location: "${bestResult.name}" (ID: ${bestResult.id}, Pop: ${bestResult.population})`);

            const { latitude, longitude, name, admin1 } = bestResult;

            // Build display name with region for better context
            const displayLocation = admin1 && admin1 !== name
                ? `${name}, ${admin1}`
                : name;

            // 2. Fetch Weather
            const weatherUrl = `${WeatherService.WEATHER_API}?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FBerlin`;
            const weatherRes = await axios.get(weatherUrl);
            const weatherData = weatherRes.data;

            if (!weatherData.current_weather) return null;

            // 3. Transform Data
            const current = weatherData.current_weather;
            const daily = weatherData.daily;

            const forecast = [];
            // Next 3 days (Indices 1, 2, 3 - 0 is today)
            for (let i = 0; i <= 2; i++) {
                forecast.push({
                    day: new Date(daily.time[i]).toLocaleDateString('de-DE', { weekday: 'short' }),
                    tempMax: daily.temperature_2m_max[i],
                    tempMin: daily.temperature_2m_min[i],
                    code: daily.weathercode[i],
                    condition: WeatherService.getWeatherCondition(daily.weathercode[i])
                });
            }

            return {
                location: displayLocation,
                current: {
                    temperature: current.temperature,
                    condition: WeatherService.getWeatherCondition(current.weathercode),
                    code: current.weathercode,
                    windSpeed: current.windspeed
                },
                forecast
            };

        } catch (error) {
            console.error('WeatherService Error:', error);
            return null;
        }
    }
}

export const weatherService = new WeatherService();