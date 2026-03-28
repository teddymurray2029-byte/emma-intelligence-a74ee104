import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/lib/emma-stream";

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("role, content, metadata")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        imageUrl: m.metadata?.imageUrl,
      })));
    }
    setLoading(false);
  }, [conversationId]);

  const saveMessage = async (role: string, content: string, metadata?: Record<string, any>) => {
    if (!conversationId) return;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata || {},
    });
  };

  const addLocal = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const updateLastAssistant = (content: string, imageUrl?: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content, ...(imageUrl ? { imageUrl } : {}) } : m
        );
      }
      return [...prev, { role: "assistant", content, ...(imageUrl ? { imageUrl } : {}) }];
    });
  };

  return { messages, loading, load, saveMessage, addLocal, updateLastAssistant, setMessages };
}
