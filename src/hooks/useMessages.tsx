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
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
    setLoading(false);
  }, [conversationId]);

  const saveMessage = async (role: string, content: string) => {
    if (!conversationId) return;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role,
      content,
    });
  };

  const addLocal = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const updateLastAssistant = (content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content } : m
        );
      }
      return [...prev, { role: "assistant", content }];
    });
  };

  return { messages, loading, load, saveMessage, addLocal, updateLastAssistant, setMessages };
}
