import { useState, useEffect, useCallback } from "react";
import { dbProxy } from "@/lib/db-proxy";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  parent_id?: string | null;
}

export function useConversations(userId: string | undefined, getToken?: () => Promise<string | null>) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const tokenGetter = getToken || (async () => null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await dbProxy("list_conversations", {}, tokenGetter);
      if (data) setConversations(data);
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
    setLoading(false);
  }, [userId, tokenGetter]);

  useEffect(() => { load(); }, [load]);

  const create = async (title = "New Conversation") => {
    if (!userId) return null;
    try {
      const { data } = await dbProxy("create_conversation", { title }, tokenGetter);
      if (data) {
        setConversations((prev) => [data, ...prev]);
        return data;
      }
    } catch (e) {
      console.error("Failed to create conversation:", e);
    }
    return null;
  };

  const remove = async (id: string) => {
    try {
      await dbProxy("delete_conversation", { id }, tokenGetter);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  };

  const rename = async (id: string, title: string) => {
    try {
      await dbProxy("rename_conversation", { id, title }, tokenGetter);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
    } catch (e) {
      console.error("Failed to rename conversation:", e);
    }
  };

  const update = async (id: string, updates: Record<string, any>) => {
    try {
      await dbProxy("update_conversation", { id, updates }, tokenGetter);
    } catch (e) {
      console.error("Failed to update conversation:", e);
    }
  };

  return { conversations, loading, create, remove, rename, update, reload: load };
}
