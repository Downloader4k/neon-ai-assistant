
import { prisma } from './prisma';


export async function createConversation(data: { userId: string; title?: string; type?: string }) {
    return prisma.conversation.create({
        data: {
            userId: data.userId,
            title: data.title || 'New Conversation',
            sessionId: 'session-' + Date.now(),
            summary: '',
            importanceScore: 0,
            type: data.type || 'chat'
        }
    });
}

export async function createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; metadata?: any }) {
    // 1. Create the message
    const message = await prisma.message.create({
        data: {
            conversationId: data.conversationId,
            role: data.role,
            content: data.content,
            modelUsed: data.modelUsed,
            metadata: data.metadata ? JSON.stringify(data.metadata) : undefined
        }
    });

    // 2. Mark conversation as unprocessed (so it gets picked up by extraction job)
    await prisma.conversation.update({
        where: { id: data.conversationId },
        data: {
            processed: false,
            updatedAt: new Date() // Keep it fresh
        }
    });

    return message;
}

export async function getConversation(id: string) {
    return prisma.conversation.findUnique({
        where: { id },
        include: { messages: true }
    });
}

export async function getConversationHistory(conversationId: string, limit: number = 50) {
    const convo = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            messages: {
                orderBy: { timestamp: 'asc' },
                take: -limit
            }
        }
    });
    return convo?.messages || [];
}

export async function getUserConversations(userId: string, _type: string = 'chat') {
    const conversations = await prisma.conversation.findMany({
        where: { userId },
        include: {
            _count: {
                select: { messages: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    // Filter out empty conversations (no messages)
    return conversations.filter(c => c._count.messages > 0);
}

export async function updateConversation(id: string, data: any) {
    return prisma.conversation.update({
        where: { id },
        data
    });
}

export async function deleteConversation(id: string) {
    return prisma.conversation.delete({
        where: { id }
    });
}
