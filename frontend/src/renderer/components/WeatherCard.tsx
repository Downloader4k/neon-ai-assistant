import React from 'react';
import { 
  Cloud, CloudRain, CloudSnow, Sun, Wind, CloudLightning, CloudFog, CloudDrizzle, 
  Thermometer, Droplets, MapPin, Calendar 
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface WeatherData {
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
    location: string;
}

export default function WeatherCard({ data }: { data: WeatherData }) {
    if (!data || !data.current) return null;

    const { current, forecast, location } = data;
    const code = current.code;

    // --- Dynamic Theme Logic ---
    let bgClass = 'bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-900'; // Default (Night/Stormy)
    let icon = <Sun size={64} className="text-yellow-300 animate-weather-spin drop-shadow-lg" />;
    let textColor = 'text-white';
    let glowClass = 'temp-glow-neutral';
    let overlayClass = '';
    let isSunny = false; // Flag to force dark text style inline
    let isWinter = current.temperature < 5; // Winter/Frost mode for cold temps

    // Temperature Glow Logic
    if (current.temperature > 25) glowClass = 'temp-glow-warm';
    else if (current.temperature < 10) glowClass = 'temp-glow-cool';
    
    // WMO Code Themes
    // 0: Clear/Sunny (ONLY code 0 is truly sunny!)
    if (code === 0) { 
        if (isWinter) {
            // Winter sun: Cold but clear
            bgClass = 'bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600'; // Frosty blue
            icon = <Sun size={80} className="text-yellow-200 drop-shadow-2xl animate-weather-spin" style={{ animationDuration: '30s' }} />;
            textColor = 'text-slate-800';
        } else {
            bgClass = 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600'; // Sunset/Sunny Vibes
            icon = <Sun size={80} className="text-yellow-100 drop-shadow-2xl animate-weather-spin" style={{ animationDuration: '30s' }} />;
            textColor = 'text-yellow-950'; // Dark text on vibrant orange
            isSunny = true;
        }
        glowClass = 'text-shadow-none';
        overlayClass = 'bg-gradient-to-t from-black/10 to-transparent';
    } 
    // 1-2: Partly cloudy (MAINLY CLOUDY, NOT SUNNY!)
    else if (code >= 1 && code <= 2) {
        if (isWinter) {
            bgClass = 'bg-gradient-to-br from-slate-400 via-slate-500 to-sky-600'; // Cold grey with blue tint
            icon = <Cloud size={80} className="text-slate-200 drop-shadow-2xl animate-weather-float" />;
        } else {
            bgClass = 'bg-gradient-to-br from-slate-400 via-gray-500 to-slate-600'; // Neutral grey
            icon = <Cloud size={80} className="text-slate-100 drop-shadow-2xl animate-weather-float" />;
        }
        textColor = 'text-slate-100';
    }
    // 3: Overcast
    else if (code === 3) {
        bgClass = 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-800'; // Moody Grey
        icon = <Cloud size={80} className="text-slate-200 drop-shadow-2xl animate-weather-float" />;
        textColor = 'text-slate-100';
    } 
    // 45, 48: Fog
    else if (code >= 45 && code <= 48) {
        bgClass = 'bg-gradient-to-br from-slate-400 via-gray-400 to-zinc-500'; // Misty
        icon = <CloudFog size={80} className="text-white/80 drop-shadow-xl animate-pulse" />;
        textColor = 'text-white';
    } 
    // 51-67, 80-82: Rain/Drizzle
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        bgClass = 'bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900'; // Deep Blue Rain
        icon = <CloudRain size={80} className="text-blue-200 drop-shadow-2xl animate-weather-float" />;
        textColor = 'text-blue-50';
        glowClass = 'temp-glow-cool';
    } 
    // 71-77: Snow
    else if (code >= 71 && code <= 77) {
        bgClass = 'bg-gradient-to-br from-sky-300 via-blue-200 to-indigo-300'; // Icy Bright
        icon = <CloudSnow size={80} className="text-white drop-shadow-xl animate-weather-float" />;
        textColor = 'text-slate-800'; // Dark text on light snow bg
        glowClass = 'text-shadow-none'; // No glow on light bg
    } 
    // 95-99: Thunderstorm
    else if (code >= 95) {
        bgClass = 'bg-gradient-to-br from-purple-900 via-slate-900 to-black'; // Electric Dark
        icon = <CloudLightning size={80} className="text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.6)] animate-pulse" />;
        textColor = 'text-purple-50';
    }

    const getWeatherIcon = (c: number, size = 20) => {
        if (c === 0) return <Sun size={size} />; // Only code 0 is sunny!
        if (c <= 3) return <Cloud size={size} />; // Code 1-3: Cloudy (no sun!)
        if (c <= 48) return <CloudFog size={size} />;
        if (c <= 67) return <CloudRain size={size} />;
        if (c <= 77) return <CloudSnow size={size} />;
        return <CloudLightning size={size} />;
    };

    return (
        <div className={`relative overflow-hidden rounded-[24px] shadow-2xl my-4 w-full max-w-[340px] transform-gpu transition-transform duration-300 hover:scale-[1.02] group ${bgClass} ${textColor} z-0`}>
            
            {/* Ambient Background Noise/Texture */}
            <div className={`absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay pointer-events-none rounded-[24px]`}></div>
            <div className={`absolute inset-0 ${overlayClass} pointer-events-none rounded-[24px]`}></div>

            {/* Header: Location & Time */}
            <div className="relative z-10 p-5 pb-0 flex justify-between items-start">
                <div>
                    <div 
                        className="flex items-center gap-1.5 opacity-80 mb-1 text-xs font-bold tracking-wide uppercase"
                        style={isSunny ? { color: '#451a03' } : {}}
                    >
                        <MapPin size={12} strokeWidth={3} />
                        {location}
                    </div>
                    <h2 
                        className={`text-5xl font-extrabold tracking-tighter leading-tight ${!isSunny ? glowClass : ''}`}
                        style={isSunny ? { color: '#451a03', textShadow: 'none' } : {}}
                    >
                        {Math.round(current.temperature)}°
                    </h2>
                    <div 
                        className={`text-sm font-semibold opacity-90 tracking-wide mt-1 flex items-center gap-2`}
                        style={isSunny ? { color: '#451a03' } : {}}
                    >
                        {current.condition}
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                        <span className="opacity-80">{format(new Date(), 'EEE, d. MMM', { locale: de })}</span>
                    </div>
                </div>
                
                {/* Hero Icon (Right) */}
                <div className="filter drop-shadow-2xl opacity-90 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform duration-700">
                    {icon}
                </div>
            </div>

            {/* Middle: Stats Chips */}
            <div className="relative z-10 px-5 mt-6 flex gap-3">
                <div className="glass-panel rounded-xl px-3 py-2 flex items-center gap-2 flex-1 shadow-sm border border-white/5 bg-white/5 backdrop-blur-sm">
                    <Wind size={16} className="opacity-70" />
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] opacity-60 uppercase font-bold tracking-wider">Wind</span>
                        <span className="text-sm font-semibold">{current.windSpeed} <span className="text-[10px] opacity-70">km/h</span></span>
                    </div>
                </div>
                {/* Mock Humidity (API doesn't provide it yet, placeholder for layout) */}
                <div className="glass-panel rounded-xl px-3 py-2 flex items-center gap-2 flex-1 shadow-sm border border-white/5 bg-white/5 backdrop-blur-sm">
                    <Droplets size={16} className="opacity-70" />
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] opacity-60 uppercase font-bold tracking-wider">Feucht.</span>
                        <span className="text-sm font-semibold">-- <span className="text-[10px] opacity-70">%</span></span>
                    </div>
                </div>
            </div>

            {/* Footer: 3-Day Forecast */}
            <div className="relative z-10 mt-6 bg-black/10 backdrop-blur-md p-4 border-t border-white/5">
                <div className="flex justify-between gap-2">
                    {forecast.map((day, i) => {
                        // Visual Range Bar Calculation (simple mock)
                        // Assume global range -10 to 40 for bar width
                        const range = 50; 
                        const left = ((day.tempMin + 10) / range) * 100;
                        const width = ((day.tempMax - day.tempMin) / range) * 100;
                        
                        return (
                            <div key={i} className="flex flex-col items-center flex-1 group/day cursor-default">
                                <span className="text-[10px] font-bold opacity-60 mb-1.5 uppercase tracking-widest group-hover/day:opacity-100 transition-opacity">{day.day}</span>
                                <div className="mb-2 opacity-80 group-hover/day:scale-110 transition-transform duration-300">
                                    {getWeatherIcon(day.code, 24)}
                                </div>
                                
                                {/* Temperature Text */}
                                <div className="flex justify-between w-full px-1 text-xs font-medium opacity-90">
                                    <span className="opacity-70">{Math.round(day.tempMin)}°</span>
                                    <span>{Math.round(day.tempMax)}°</span>
                                </div>
                                
                                {/* Visual Range Bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden relative">
                                    <div 
                                        className="absolute h-full rounded-full bg-current opacity-50" 
                                        style={{ 
                                            left: `${Math.max(0, Math.min(100, left))}%`, 
                                            width: `${Math.max(10, Math.min(100, width))}%` 
                                        }} 
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
