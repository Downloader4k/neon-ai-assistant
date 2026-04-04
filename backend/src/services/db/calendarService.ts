import { prisma } from './prisma';

export interface CreateCalendarInput {
    userId: string;
    title: string;
    description?: string;
    startDate: string;
    endDate?: string;
    location?: string;
    category?: string;
    color?: string;
    isAllDay?: boolean;
}

export interface UpdateCalendarInput {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    category?: string;
    color?: string;
    isAllDay?: boolean;
}

class CalendarService {
    async create(input: CreateCalendarInput) {
        const startDate = new Date(input.startDate);
        const endDate = input.endDate ? new Date(input.endDate) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default: 1h

        return prisma.calendarEvent.create({
            data: {
                userId: input.userId,
                title: input.title,
                description: input.description || null,
                startDate,
                endDate,
                location: input.location || null,
                category: input.category || 'Allgemein',
                color: input.color || null,
                isAllDay: input.isAllDay || false,
            },
        });
    }

    async getAll(userId: string, filters?: { category?: string }) {
        const where: any = { userId };
        if (filters?.category) where.category = filters.category;

        return prisma.calendarEvent.findMany({
            where,
            orderBy: { startDate: 'asc' },
        });
    }

    async getByDateRange(userId: string, startDate: Date, endDate: Date) {
        return prisma.calendarEvent.findMany({
            where: {
                userId,
                startDate: { lte: endDate },
                endDate: { gte: startDate },
            },
            orderBy: { startDate: 'asc' },
        });
    }

    async getUpcoming(userId: string, days: number = 7) {
        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        return this.getByDateRange(userId, now, future);
    }

    async getById(id: string) {
        return prisma.calendarEvent.findUnique({ where: { id } });
    }

    async update(id: string, input: UpdateCalendarInput) {
        const data: any = { ...input };
        if (input.startDate) data.startDate = new Date(input.startDate);
        if (input.endDate) data.endDate = new Date(input.endDate);
        return prisma.calendarEvent.update({ where: { id }, data });
    }

    async delete(id: string) {
        return prisma.calendarEvent.delete({ where: { id } });
    }

    async getCategories(userId: string): Promise<string[]> {
        const items = await prisma.calendarEvent.findMany({
            where: { userId },
            select: { category: true },
            distinct: ['category'],
        });
        return items.map((i: any) => i.category);
    }

    async getStats(userId: string) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [total, today, thisWeek] = await Promise.all([
            prisma.calendarEvent.count({ where: { userId } }),
            prisma.calendarEvent.count({
                where: {
                    userId,
                    startDate: { gte: todayStart, lt: todayEnd },
                },
            }),
            prisma.calendarEvent.count({
                where: {
                    userId,
                    startDate: { gte: now, lt: weekEnd },
                },
            }),
        ]);
        return { total, today, thisWeek };
    }

    /**
     * AI-powered auto-categorization of a calendar event
     */
    aiCategorize(title: string): { category: string; color: string } {
        const lower = title.toLowerCase();
        let category = 'Allgemein';
        let color = '#f9ab00'; // Default gold

        if (/arbeit|meeting|besprechung|konferenz|call|praesentati|buero|chef|team|standup|daily/i.test(lower)) {
            category = 'Arbeit';
            color = '#4285f4'; // Blue
        } else if (/arzt|zahnarzt|apotheke|krankenhaus|therapie|untersuchung|impf/i.test(lower)) {
            category = 'Gesundheit';
            color = '#ea4335'; // Red
        } else if (/sport|fitness|training|joggen|schwimmen|yoga|gym/i.test(lower)) {
            category = 'Sport';
            color = '#34a853'; // Green
        } else if (/geburtstag|feier|party|hochzeit|jubilaeum|fest/i.test(lower)) {
            category = 'Feier';
            color = '#ff6d01'; // Orange
        } else if (/schule|uni|kurs|vorlesung|pruefung|seminar|lernen|nachhilfe/i.test(lower)) {
            category = 'Bildung';
            color = '#9c27b0'; // Purple
        } else if (/einkauf|termin|amt|behoerde|bank|versicher|vertrag|handwerker/i.test(lower)) {
            category = 'Erledigung';
            color = '#795548'; // Brown
        } else if (/film|kino|konzert|theater|essen|restaurant|cafe|ausflug|reise|urlaub|treffen|freund/i.test(lower)) {
            category = 'Freizeit';
            color = '#e91e63'; // Pink
        } else if (/friseur|kosmetik|wellness|massage|sauna/i.test(lower)) {
            category = 'Persoenlich';
            color = '#00bcd4'; // Cyan
        }

        return { category, color };
    }

    /**
     * Parse a natural language date reference into a Date object.
     * Supports: heute, morgen, uebermorgen, Montag-Sonntag, "am 5.", "am 5. April"
     */
    parseGermanDate(text: string): Date | null {
        const lower = text.toLowerCase();
        const now = new Date();

        if (/heute/.test(lower)) return now;
        if (/morgen/.test(lower) && !/uebermorgen|übermorgen/.test(lower)) {
            return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }
        if (/uebermorgen|übermorgen/.test(lower)) {
            return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        }

        // Wochentag
        const dayNames: Record<string, number> = {
            'montag': 1, 'dienstag': 2, 'mittwoch': 3, 'donnerstag': 4,
            'freitag': 5, 'samstag': 6, 'sonntag': 0,
        };
        for (const [name, dayIdx] of Object.entries(dayNames)) {
            if (lower.includes(name)) {
                const today = now.getDay();
                let diff = dayIdx - today;
                if (diff <= 0) diff += 7;
                return new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
            }
        }

        // "am 5." or "am 5. April" or "5. april"
        const monthNames: Record<string, number> = {
            'januar': 0, 'februar': 1, 'maerz': 2, 'märz': 2, 'april': 3,
            'mai': 4, 'juni': 5, 'juli': 6, 'august': 7, 'september': 8,
            'oktober': 9, 'november': 10, 'dezember': 11,
        };
        const dateMatch = lower.match(/(?:am\s+)?(\d{1,2})\.?\s*(?:(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember))?/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            let month = dateMatch[2] ? monthNames[dateMatch[2]] : now.getMonth();
            let year = now.getFullYear();
            const result = new Date(year, month, day);
            if (result < now) {
                // If the date is in the past, assume next month or next year
                if (!dateMatch[2]) {
                    result.setMonth(result.getMonth() + 1);
                } else {
                    result.setFullYear(result.getFullYear() + 1);
                }
            }
            return result;
        }

        return null;
    }

    /**
     * Parse a time string like "14 Uhr", "14:30", "halb 3", "um 10"
     */
    parseGermanTime(text: string): { hours: number; minutes: number } | null {
        const lower = text.toLowerCase();

        // "14:30" or "14.30"
        const timeMatch = lower.match(/(\d{1,2})[:.:](\d{2})\s*(?:uhr)?/);
        if (timeMatch) {
            return { hours: parseInt(timeMatch[1]), minutes: parseInt(timeMatch[2]) };
        }

        // "14 Uhr" or "um 14"
        const hourMatch = lower.match(/(?:um\s+)?(\d{1,2})\s*uhr/);
        if (hourMatch) {
            return { hours: parseInt(hourMatch[1]), minutes: 0 };
        }

        // just "um 14" without Uhr
        const umMatch = lower.match(/um\s+(\d{1,2})(?:\s|$|,|\.)/);
        if (umMatch) {
            return { hours: parseInt(umMatch[1]), minutes: 0 };
        }

        // "halb 3" = 2:30
        const halbMatch = lower.match(/halb\s+(\d{1,2})/);
        if (halbMatch) {
            const h = parseInt(halbMatch[1]) - 1;
            return { hours: h, minutes: 30 };
        }

        return null;
    }
}

export const calendarService = new CalendarService();
