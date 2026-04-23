import { supabase } from './supabaseClient';

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string; // Business ID
    content: string;
    created_at: string;
}

export const deleteConversation = async (conversationId: string): Promise<boolean> => {
    // Delete messages first (cascade usually handles this but RLS might block if not careful, 
    // let's rely on cascade or explicit delete if foreign keys allow).
    // Safest: Delete messages, then conversation.

    const { error: msgError } = await supabase.from('messages').delete().eq('conversation_id', conversationId);
    if (msgError) {
        console.error('Error deleting messages:', msgError);
        return false;
    }

    const { error: convoError } = await supabase.from('conversations').delete().eq('id', conversationId);
    if (convoError) {
        console.error('Error deleting conversation:', convoError);
        return false;
    }

    return true;
};

export interface Conversation {
    id: string;
    participant_1: string; // Business ID
    participant_2: string; // Business ID
    product_id?: string;
    last_message?: string;
    updated_at: string;
    // Joined fields
    p1?: { name: string, email: string };
    p2?: { name: string, email: string };
    product?: { name: string, imageUrl: string };
}

export const getConversations = async (businessId: string): Promise<Conversation[]> => {
    // Or logic: p1=id OR p2=id
    // Simplified: No joins to avoid 400 errors. Names mapped in frontend.
    const { data: c1, error: e1 } = await supabase
        .from('conversations')
        .select('*')
        .eq('participant_1', businessId);

    const { data: c2, error: e2 } = await supabase
        .from('conversations')
        .select('*')
        .eq('participant_2', businessId);

    if (e1 || e2) {
        console.error('Error fetching conversations:', e1 || e2);
        return [];
    }

    // Merge and sort
    const merged = [...(c1 || []), ...(c2 || [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Deduplicate if needed (though eq p1 vs p2 should be distinct unless self-chat)
    // Map to unique via ID
    const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());

    return unique;
};

export const getMessages = async (conversationId: string): Promise<Message[]> => {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
    return data;
};

export const sendMessage = async (conversationId: string, senderId: string, content: string): Promise<boolean> => {
    const { error } = await supabase
        .from('messages')
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content
        });

    if (error) {
        console.error('Error sending message:', error);
        return false;
    }

    // Update conversation last_message/time
    await supabase.from('conversations').update({
        last_message: content,
        updated_at: new Date().toISOString()
    }).eq('id', conversationId);

    return true;
};

export const startConversation = async (senderId: string, receiverId: string, productId?: string, initialMessage?: string): Promise<string | null> => {
    // 1. Try to find existing conversation between these parties
    // We fetch conversations where I am P1 or P2
    const { data: myConversations, error: fetchError } = await supabase
        .from('conversations')
        .select('id, participant_1, participant_2, product_id')
        .or(`participant_1.eq.${senderId},participant_2.eq.${senderId}`);

    if (fetchError) {
        console.error('Error searching conversations:', fetchError);
        return null;
    }

    // 2. Filter in JS to find exact match
    const existing = myConversations?.find(c => {
        const isParticipant = (c.participant_1 === receiverId || c.participant_2 === receiverId);
        const matchProduct = productId ? c.product_id === productId : true; // strictly match product if provided? Or reuse general chat? 
        // For marketplace, we want distinct chat per product interaction usually, OR just one chat per provider?
        // Let's go with: Same product = Same chat. Different product = New chat.
        // If product is NOT provided (general), we look for one without product? Or reuse any?
        // Let's assume strict product match if product provided.
        return isParticipant && matchProduct;
    });

    if (existing) {
        if (initialMessage) {
            // Check if last message is duplicate? No, just send.
            await sendMessage(existing.id, senderId, initialMessage);
        }
        return existing.id;
    }

    // 3. Create new if not found
    const { data: newConvo, error } = await supabase.from('conversations').insert({
        participant_1: senderId,
        participant_2: receiverId,
        product_id: productId || null,
        last_message: initialMessage || 'Conversación iniciada',
        updated_at: new Date().toISOString()
    }).select().single();

    if (error || !newConvo) {
        console.error('Error creating conversation:', error);
        return null;
    }

    if (initialMessage) {
        await sendMessage(newConvo.id, senderId, initialMessage);
    }

    return newConvo.id;
};
