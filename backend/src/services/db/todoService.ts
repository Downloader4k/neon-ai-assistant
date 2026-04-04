import { prisma } from './prisma';

export interface CreateTodoInput {
    userId: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    dueDate?: string;
}

export interface UpdateTodoInput {
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
    dueDate?: string | null;
}

class TodoService {
    async create(input: CreateTodoInput) {
        return prisma.todoItem.create({
            data: {
                userId: input.userId,
                title: input.title,
                description: input.description,
                category: input.category || 'Allgemein',
                priority: input.priority || 'medium',
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
            },
        });
    }

    async getAll(userId: string, filters?: { status?: string; category?: string; priority?: string }) {
        const where: any = { userId };
        if (filters?.status) where.status = filters.status;
        if (filters?.category) where.category = filters.category;
        if (filters?.priority) where.priority = filters.priority;

        return prisma.todoItem.findMany({
            where,
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' },
            ],
        });
    }

    async getById(id: string) {
        return prisma.todoItem.findUnique({ where: { id } });
    }

    async update(id: string, input: UpdateTodoInput) {
        const data: any = { ...input };
        if (input.dueDate !== undefined) {
            data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        }
        return prisma.todoItem.update({ where: { id }, data });
    }

    async complete(id: string) {
        return prisma.todoItem.update({
            where: { id },
            data: { status: 'done', completedAt: new Date() },
        });
    }

    async reopen(id: string) {
        return prisma.todoItem.update({
            where: { id },
            data: { status: 'open', completedAt: null },
        });
    }

    async delete(id: string) {
        return prisma.todoItem.delete({ where: { id } });
    }

    async getCategories(userId: string): Promise<string[]> {
        const items = await prisma.todoItem.findMany({
            where: { userId },
            select: { category: true },
            distinct: ['category'],
        });
        return items.map((i: any) => i.category);
    }

    async getStats(userId: string) {
        const [total, open, done, overdue] = await Promise.all([
            prisma.todoItem.count({ where: { userId } }),
            prisma.todoItem.count({ where: { userId, status: 'open' } }),
            prisma.todoItem.count({ where: { userId, status: 'done' } }),
            prisma.todoItem.count({
                where: {
                    userId,
                    status: { not: 'done' },
                    dueDate: { lt: new Date() },
                },
            }),
        ]);
        return { total, open, done, overdue };
    }

    /**
     * AI-powered auto-categorization of a todo item
     */
    async aiCategorize(title: string): Promise<{ category: string; priority: string }> {
        // Simple keyword-based categorization (fast, no AI call needed)
        const lower = title.toLowerCase();
        let category = 'Allgemein';
        let priority = 'medium';

        // Category detection
        if (/arbeit|meeting|projekt|deadline|client|buero|chef|praesentati/i.test(lower)) category = 'Arbeit';
        else if (/arzt|zahnarzt|apotheke|medikament|sport|fitness|gesund/i.test(lower)) category = 'Gesundheit';
        else if (/putzen|waschen|saugen|muell|reparier|garten|aufraeum/i.test(lower)) category = 'Haushalt';
        else if (/einkauf|kaufen|bestell|liefer|paket/i.test(lower)) category = 'Einkauf';
        else if (/rechnung|ueberweis|steuer|bank|versicher|miete|geld/i.test(lower)) category = 'Finanzen';
        else if (/lernen|kurs|buch|lesen|studier|pruefung|schule|uni/i.test(lower)) category = 'Bildung';
        else if (/code|programmier|bug|server|update|install|computer|software/i.test(lower)) category = 'Technik';
        else if (/film|spiel|party|treffen|freund|hobby|urlaub|reise/i.test(lower)) category = 'Freizeit';
        else if (/geburtstag|geschenk|anruf|termin|brief/i.test(lower)) category = 'Persoenlich';

        // Priority detection
        if (/dringend|sofort|asap|heute|notfall|wichtig|urgent/i.test(lower)) priority = 'urgent';
        else if (/bald|morgen|diese woche|wichtig/i.test(lower)) priority = 'high';
        else if (/irgendwann|spaeter|wenn zeit|optional/i.test(lower)) priority = 'low';

        return { category, priority };
    }
}

export const todoService = new TodoService();
