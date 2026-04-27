import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace } from "@/lib/pm-api";
import { supabase } from "@/integrations/supabase/client";
import { Hash, Plus, Send, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ProjectChat() {
  const { id } = useParams();
  const { getToken, user } = useAuth();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async () => {
    if (!id) return;
    const r = await pmApi.listChannels(id, getToken);
    setChannels(r.data || []);
    if (!activeChannel && r.data?.[0]) setActiveChannel(r.data[0].id);
  }, [id, getToken, activeChannel]);

  const loadMessages = useCallback(async () => {
    if (!activeChannel) return;
    const r = await pmApi.listMessages({ channel_id: activeChannel }, getToken);
    setMessages(r.data || []);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, [activeChannel, getToken]);

  useEffect(() => { loadChannels(); }, [loadChannels]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime
  useEffect(() => {
    if (!activeChannel) return;
    const ch = supabase.channel(`chat-${activeChannel}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "pm_chat_messages", filter: `channel_id=eq.${activeChannel}` },
        (payload) => {
          setMessages((m) => [...m, payload.new]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannel]);

  const send = async () => {
    if (!draft.trim() || !activeChannel) return;
    const text = draft;
    setDraft("");
    try {
      await pmApi.sendMessage({ channel_id: activeChannel, body: text }, getToken);
    } catch (e: any) { toast.error(e.message); setDraft(text); }
  };

  const createChannel = async () => {
    if (!newName.trim() || !id) return;
    try {
      const r = await pmApi.createChannel({ workspace_id: id, name: newName }, getToken);
      setNewName(""); setOpen(false);
      await loadChannels();
      setActiveChannel(r.data.id);
    } catch (e: any) { toast.error(e.message); }
  };

  const active = channels.find((c) => c.id === activeChannel);

  return (
    <div className="h-full grid grid-cols-[220px,1fr] overflow-hidden">
      {/* Channel list */}
      <div className="border-r border-border bg-card/30 overflow-auto">
        <div className="p-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Channels</span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New channel</DialogTitle></DialogHeader>
              <Input placeholder="channel-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <Button onClick={createChannel} disabled={!newName.trim()}>Create</Button>
            </DialogContent>
          </Dialog>
        </div>
        <div className="px-2 space-y-0.5">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChannel(c.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                activeChannel === c.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {c.is_private ? <Lock className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat pane */}
      <div className="flex flex-col overflow-hidden">
        {active && (
          <header className="border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 font-semibold"><Hash className="h-4 w-4" />{active.name}</div>
            {active.topic && <div className="text-xs text-muted-foreground">{active.topic}</div>}
          </header>
        )}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No messages yet — say hi 👋</div>}
          {messages.map((m) => (
            <div key={m.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {m.author_id === "emma-bot" ? "🤖" : (m.author_name?.[0] || m.author_id?.[0] || "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{m.author_id === "emma-bot" ? "Emma" : (m.author_name || m.author_id?.slice(0, 12))}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <Textarea
              placeholder={active ? `Message #${active.name}` : "Select a channel"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={!draft.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
