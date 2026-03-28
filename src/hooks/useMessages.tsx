import { useState, useCallback } from "react";
import { dbProxy } from "@/lib/db-proxy";
import type { Message } from "@/lib/emma-stream";

export function useMessages(conversationId: string | null, getToken?: () => Promise<string | null>) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const tokenGetter = getToken || (async () => null);

  const load = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    try {
      const { data } = await dbProxy("list_messages", { conversation_id: conversationId }, tokenGetter);
      if (data) {
        setMessages(data.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          imageUrl: m.metadata?.imageUrl,
        })));
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
    setLoading(false);
  }, [conversationId, tokenGetter]);

  const saveMessage = async (role: string, content: string, metadata?: Record<string, any>) => {
    if (!conversationId) return;
    try {
      await dbProxy("save_message", {
        conversation_id: conversationId,
        role,
        content,
        metadata: metadata || {},
      }, tokenGetter);
    } catch (e) {
      console.error("Failed to save message:", e);
    }
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
