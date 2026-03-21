
import { PrismaClient } from '@prisma/client';
require('dotenv').config();

console.log('Seeding memory (v5 - with user)...');
console.log('DB URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

const interviewData = [
    { q: 'name', a: 'Thorben', type: 'FACT' },
    { q: 'age', a: '34 jahre alt', type: 'FACT' },
    { q: 'location', a: 'Wiefelstede, Ammerland', type: 'FACT' },
    { q: 'job', a: 'Fachkraft für Lagerlogistik', type: 'FACT' },
    { q: 'living', a: 'Einfamilienhaus mit Bruder und Mutter', type: 'FACT' },
    { q: 'rhythm', a: 'Schichtdienst (Früh/Spät Wechsel)', type: 'FACT' },
    { q: 'projects', a: 'Neon (KI), Kapselmaschine (Raspberry Pi), MegaKino (Streaming)', type: 'PROJECT' },
    { q: 'relaxation', a: 'Musik (House, Piano), Hörspiele (TKKG, Drei ???)', type: 'PREFERENCE' },
    { q: 'media_passive', a: 'YouTube Gaming (Lets Plays), Max Speedshop (Oldtimer)', type: 'PREFERENCE' },
    { q: 'favorites', a: 'Joel Brandenstein, Harry Potter, James Bond', type: 'PREFERENCE' },
    { q: 'goals_short', a: 'Zimmer renovieren, TV Wandhalterung, NFC Bluray Regal', type: 'GOAL' },
    { q: 'goals_long', a: 'Millionär werden', type: 'GOAL' }
];

async function main() {
    const userId = 'default-user';

    console.log(`Ensuring user ${userId} exists...`);
    // Create User First
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
            id: userId,
            name: 'Thorben',
            email: 'thorben@neon.ai'
        }
    });
    console.log(`User confirmed.`);

    console.log(`Starting insertion of ${interviewData.length} items...`);

    for (const item of interviewData) {
        const content = `Interview (${item.q}): ${item.a}`;

        try {
            const entry = await prisma.memoryEntry.create({
                data: {
                    userId,
                    type: item.type as any,
                    content,
                    importanceScore: 1.0,
                    isActive: true,
                    // sourceExtractionId: 'seed-script-v5' // REMOVED to fix FK error
                }
            });
            console.log(`Created ${entry.id}`);
        } catch (e) {
            console.error('Failed to create:', e);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
