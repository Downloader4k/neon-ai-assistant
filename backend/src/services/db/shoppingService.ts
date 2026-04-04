import { prisma } from './prisma';

export interface CreateShoppingItemInput {
    userId: string;
    name: string;
    quantity?: string;
    category?: string;
    store?: string;
    listId?: string;
}

class ShoppingService {
    async addItem(input: CreateShoppingItemInput) {
        const categorized = this.aiCategorize(input.name);
        return prisma.shoppingItem.create({
            data: {
                userId: input.userId,
                name: input.name,
                quantity: input.quantity,
                category: input.category || categorized.category,
                store: input.store || categorized.store,
                listId: input.listId,
                aiSorted: !input.category, // AI sorted if no manual category
            },
        });
    }

    async addItems(userId: string, items: string[], listId?: string, explicitStore?: string | null) {
        const results = [];
        for (const item of items) {
            // Parse "2x Milch" or "500g Mehl" format
            const parsed = this.parseItem(item.trim());
            const categorized = this.aiCategorize(parsed.name);
            const created = await prisma.shoppingItem.create({
                data: {
                    userId,
                    name: parsed.name,
                    quantity: parsed.quantity,
                    category: categorized.category,
                    store: explicitStore || categorized.store,
                    listId,
                    aiSorted: !explicitStore,
                },
            });
            results.push(created);
        }
        return results;
    }

    async getItems(userId: string, filters?: { isPurchased?: boolean; store?: string; category?: string; listId?: string }) {
        const where: any = { userId };
        if (filters?.isPurchased !== undefined) where.isPurchased = filters.isPurchased;
        if (filters?.store) where.store = filters.store;
        if (filters?.category) where.category = filters.category;
        if (filters?.listId) where.listId = filters.listId;

        return prisma.shoppingItem.findMany({
            where,
            orderBy: [
                { category: 'asc' },
                { name: 'asc' },
            ],
        });
    }

    async togglePurchased(id: string) {
        const item = await prisma.shoppingItem.findUnique({ where: { id } });
        if (!item) throw new Error('Item nicht gefunden');
        return prisma.shoppingItem.update({
            where: { id },
            data: { isPurchased: !item.isPurchased },
        });
    }

    async updateItem(id: string, data: { name?: string; quantity?: string | null; category?: string; store?: string }) {
        const item = await prisma.shoppingItem.findUnique({ where: { id } });
        if (!item) throw new Error('Item nicht gefunden');
        return prisma.shoppingItem.update({
            where: { id },
            data,
        });
    }

    async deleteItem(id: string) {
        return prisma.shoppingItem.delete({ where: { id } });
    }

    async clearPurchased(userId: string) {
        return prisma.shoppingItem.deleteMany({
            where: { userId, isPurchased: true },
        });
    }

    // --- Shopping Lists ---

    async createList(userId: string, name: string, store?: string) {
        return prisma.shoppingList.create({
            data: { userId, name, store },
        });
    }

    async getLists(userId: string) {
        return prisma.shoppingList.findMany({
            where: { userId },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteList(id: string) {
        // Items get listId set to null (onDelete: SetNull)
        return prisma.shoppingList.delete({ where: { id } });
    }

    async getStores(userId: string): Promise<string[]> {
        const items = await prisma.shoppingItem.findMany({
            where: { userId, store: { not: null } },
            select: { store: true },
            distinct: ['store'],
        });
        return items.map((i: any) => i.store).filter(Boolean) as string[];
    }

    async getCategories(userId: string): Promise<string[]> {
        const items = await prisma.shoppingItem.findMany({
            where: { userId },
            select: { category: true },
            distinct: ['category'],
        });
        return items.map((i: any) => i.category);
    }

    // --- Parsing & AI Categorization ---

    private parseItem(text: string): { name: string; quantity?: string } {
        // "2x Milch" → { name: "Milch", quantity: "2x" }
        // "500g Mehl" → { name: "Mehl", quantity: "500g" }
        // "1 Packung Butter" → { name: "Butter", quantity: "1 Packung" }
        const match = text.match(/^(\d+(?:\.\d+)?(?:\s*(?:x|kg|g|l|ml|stueck|packung|dose|flasche|beutel|becher))?\s+)(.+)$/i);
        if (match) {
            return { quantity: match[1].trim(), name: match[2].trim() };
        }
        return { name: text };
    }

    aiCategorize(name: string): { category: string; store: string | null } {
        const lower = name.toLowerCase();

        // 1. Pruefen ob der Nutzer explizit einen Laden im Text nennt
        const explicitStore = this.detectExplicitStore(lower);

        // 2. Kategorie-Zuordnung
        let category = 'Sonstiges';
        let store: string | null = explicitStore;

        // Obst & Gemuese
        if (/apfel|birne|banane|orange|traube|erdbeere|tomate|gurke|salat|kartoffel|zwiebel|karotte|paprika|zucchini|brokkoli|pilz|knoblauch|ingwer|zitrone|avocado|mango|kiwi|obst|gemuese|frucht|ananas|himbeere|blaubeere|lauch|spinat|mais|erbse|radieschen|kohlrabi|kuerbis|fenchel|sellerie|ruebe/i.test(lower)) {
            category = 'Obst & Gemuese';
            if (!store) store = 'Edeka';
        }
        // Milchprodukte
        else if (/milch|kaese|joghurt|butter|sahne|quark|creme|frischkaese|mozzarella|parmesan|schmand|skyr/i.test(lower)) {
            category = 'Milchprodukte';
            if (!store) store = 'Aldi';
        }
        // Fleisch & Fisch
        else if (/fleisch|wurst|schinken|haehnchen|huhn|rind|schwein|hack|steak|lachs|fisch|thunfisch|garnele|salami|pute|truthahn|lamm|bratwurst|leberwurst|aufschnitt|mortadella/i.test(lower)) {
            category = 'Fleisch & Fisch';
            if (!store) store = 'Edeka';
        }
        // Brot & Backwaren
        else if (/brot|broetchen|toast|croissant|kuchen|torte|mehl|hefe|backpulver|semmel|laugenstange|brezel/i.test(lower)) {
            category = 'Brot & Backwaren';
            if (!store) store = 'Lidl';
        }
        // Getraenke
        else if (/wasser|saft|cola|limo|bier|wein|kaffee|tee|energy|sprudel|drink|getraenk|fanta|sprite|apfelschorle|eistee|kakao|prosecco|sekt/i.test(lower)) {
            category = 'Getraenke';
            if (!store) store = 'Netto';
        }
        // Haushalt & Drogerie (VOR Vorrat, damit "zahnpasta" nicht als "pasta" erkannt wird)
        else if (/toilettenpapier|klopapier|spuelmittel|waschmittel|seife|shampoo|zahnpasta|zahnbuerste|duschgel|deo|creme|pflaster|taschentuch|muellbeutel|schwamm|reiniger|putzmittel|rasierer|bodylotion|handcreme|wattepads|nagellack/i.test(lower)) {
            category = 'Haushalt & Drogerie';
            if (!store) store = 'DM';
        }
        // Baby
        else if (/windel|baby|brei|milchpulver|schnuller|feuchttuch/i.test(lower)) {
            category = 'Baby';
            if (!store) store = 'DM';
        }
        // Tierbedarf
        else if (/hundefutter|katzenfutter|tierfutter|streu|leckerli|hundesnack/i.test(lower)) {
            category = 'Tierbedarf';
            if (!store) store = 'Fressnapf';
        }
        // Konserven & Vorrat
        else if (/dose|konserve|nudel|reis|pasta|spaghetti|oel|essig|zucker|salz|pfeffer|gewuerz|senf|ketchup|sauce|linsen|bohne|muesliriegel|haferflocken|marmelade|honig|nutella/i.test(lower)) {
            category = 'Vorrat & Konserven';
            if (!store) store = 'Aldi';
        }
        // Tiefkuehl
        else if (/tiefkuehl|eis|pizza|pommes|gefroren|frost/i.test(lower)) {
            category = 'Tiefkuehl';
            if (!store) store = 'Lidl';
        }
        // Suessigkeiten & Snacks
        else if (/schokolade|chips|keks|gummibaer|suessigkeit|snack|riegel|nuss|mandel|haribo|weingummi|bonbon|lakritze/i.test(lower)) {
            category = 'Suessigkeiten & Snacks';
            if (!store) store = 'Netto';
        }
        // Baumarkt
        else if (/schraube|nagel|bohrer|farbe|pinsel|klebeband|batterie|gluehbirne|lampe|werkzeug|kabel|stecker|sicherung/i.test(lower)) {
            category = 'Baumarkt';
            if (!store) store = 'Baumarkt';
        }
        // Grosseinkauf / Grosspackungen
        else if (/grosspack|vorratspack|palette|karton\s+\d|kiste/i.test(lower)) {
            if (!store) store = 'Selgros';
        }

        // Fallback: wenn kein Store erkannt, Standard-Supermarkt
        if (!store && category !== 'Sonstiges') store = 'Combi';
        if (!store) store = 'Famila';

        return { category, store };
    }

    /**
     * Erkennt ob der Nutzer einen Laden explizit im Artikelnamen nennt.
     * z.B. "Milch von Aldi" oder "Aldi Milch"
     */
    private detectExplicitStore(lower: string): string | null {
        const storeMap: Record<string, string> = {
            'aldi': 'Aldi',
            'lidl': 'Lidl',
            'netto': 'Netto',
            'edeka': 'Edeka',
            'combi': 'Combi',
            'selgros': 'Selgros',
            'famila': 'Famila',
            'dm': 'DM',
            'rossmann': 'Rossmann',
            'fressnapf': 'Fressnapf',
            'rewe': 'Rewe',
            'penny': 'Penny',
            'kaufland': 'Kaufland',
            'real': 'Real',
        };
        for (const [key, name] of Object.entries(storeMap)) {
            if (new RegExp(`\\b${key}\\b`, 'i').test(lower)) return name;
        }
        return null;
    }
}

export const shoppingService = new ShoppingService();
