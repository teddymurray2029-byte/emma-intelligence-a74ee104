import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmmaAvatar } from "@/components/EmmaAvatar";
import { EmmaSidebar } from "@/components/EmmaSidebar";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { ResearchPanel } from "@/components/ResearchPanel";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { ThinkPanel } from "@/components/ThinkPanel";
import { BuilderPanel } from "@/components/BuilderPanel";
import { VoicePanel } from "@/components/VoicePanel";
import { DataAnalysisPanel } from "@/components/DataAnalysisPanel";
import { MemoryControlPanel } from "@/components/MemoryControlPanel";
import { InspectorPanel } from "@/components/InspectorPanel";
import { PaywallModal } from "@/components/PaywallModal";
import { streamChat, generateImage, setStreamTokenGetter, type Message, type EmmaMode, type AnswerStyle, type Artifact } from "@/lib/emma-stream";
import { setAgiTokenGetter } from "@/lib/agi-api";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { generateFingerprint, incrementLocalUsage, isOverLimit, remainingFreeMessages, getLocalUsage, markLocalPaid } from "@/lib/fingerprint";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PanelRightClose, PanelRightOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dbProxy } from "@/lib/db-proxy";

const WELCOME_SUGGESTIONS = [
  { text: "Research quantum computing breakthroughs in 2026", mode: "research" as EmmaMode },
  { text: "Build me a landing page component", mode: "artifacts" as EmmaMode },
  { text: "Explain how transformers work", mode: "chat" as EmmaMode },
  { text: "Analyze my data file", mode: "data" as EmmaMode },
];

export default function Index() {
  const { user, loading: authLoading, signOut, getToken } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const { conversations, create, remove, rename, update } = useConversations(userId, getToken);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const { messages, load: loadMessages, saveMessage, addLocal, updateLastAssistant, setMessages } = useMessages(activeConvId, getToken);
  const [isLoading, setIsLoading] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [mode, setMode] = useState<EmmaMode>("chat");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("standard");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Set token getters for API modules
  useEffect(() => {
    if (getToken) {
      setStreamTokenGetter(getToken);
      setAgiTokenGetter(getToken);
    }
  }, [getToken]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => { loadMessages(); }, [activeConvId, loadMessages]);

  const handleNewChat = useCallback(async () => {
    const conv = await create();
    if (conv) setActiveConvId(conv.id);
  }, [create]);

  const handleSelectConv = (id: string) => setActiveConvId(id);

  const ensureConversation = async (input: string) => {
    let convId = activeConvId;
    if (!convId) {
      const conv = await create(input.slice(0, 60));
      if (!conv) { toast.error("Failed to create conversation"); return null; }
      convId = conv.id;
      setActiveConvId(conv.id);
    } else if (messages.length === 0) {
      await update(convId, { title: input.slice(0, 60) });
    }
    return convId;
  };

  const handleBranch = useCallback(async (messageIndex: number) => {
    const branchedMessages = messages.slice(0, messageIndex + 1);
    const title = `Branch: ${branchedMessages[0]?.content.slice(0, 40) || "New branch"}`;
    const conv = await create(title);
    if (!conv) { toast.error("Failed to create branch"); return; }
    for (const msg of branchedMessages) {
      await dbProxy("save_message", {
        conversation_id: conv.id, role: msg.role, content: msg.content,
        metadata: msg.imageUrl ? { imageUrl: msg.imageUrl } : {},
      }, getToken);
    }
    await update(conv.id, { parent_id: activeConvId });
    setActiveConvId(conv.id);
    toast.success("Conversation branched!");
  }, [messages, create, activeConvId, getToken, update]);

  const handleCreateArtifact = useCallback((title: string, content: string, type: string) => {
    const artifact: Artifact = { id: crypto.randomUUID(), title, type: type as Artifact["type"], content, version: 1, versions: [{ content, timestamp: new Date().toISOString() }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setArtifacts(prev => [...prev, artifact]);
    setMode("artifacts"); setShowRight(true);
    toast.success(`Artifact created: ${title}`);
  }, []);

  const handleUpdateArtifact = useCallback((id: string, content: string) => {
    setArtifacts(prev => prev.map(a => a.id === id ? { ...a, content, version: a.version + 1, versions: [...a.versions, { content, timestamp: new Date().toISOString() }], updatedAt: new Date().toISOString() } : a));
  }, []);

  const handleDeleteArtifact = useCallback((id: string) => { setArtifacts(prev => prev.filter(a => a.id !== id)); }, []);

  const checkUsageAndSend = async (input: string) => {
    // Check if user needs to pay
    const usage = getLocalUsage();
    if (!usage.isPaid && isOverLimit()) {
      setShowPaywall(true);
      return;
    }

    // For anonymous users, track usage via fingerprint
    const fp = await generateFingerprint();
    try {
      const tokenGetter = getToken || (async () => null);
      await dbProxy("track_usage", { fingerprint: fp }, tokenGetter);
    } catch {}
    incrementLocalUsage();

    await send(input);
  };

  const send = async (input: string) => {
    // For anonymous users without conversation support, just do local chat
    if (!user) {
      const userMsg: Message = { role: "user", content: input, mode };
      addLocal(userMsg);
      setIsLoading(true);
      let assistantSoFar = "";
      try {
        await streamChat({
          messages: [...messages, userMsg], mode, answerStyle,
          onDelta: (chunk) => { assistantSoFar += chunk; updateLastAssistant(assistantSoFar); },
          onDone: async () => { setIsLoading(false); },
          onError: (err) => { setIsLoading(false); toast.error(err); },
        });
      } catch { setIsLoading(false); toast.error("Failed to connect to Emma"); }
      return;
    }

    const convId = await ensureConversation(input);
    if (!convId) return;

    if (input.startsWith("/image ")) {
      const prompt = input.slice(7).trim();
      if (!prompt) { toast.error("Please provide an image prompt"); return; }
      const userMsg: Message = { role: "user", content: input };
      addLocal(userMsg); await saveMessage("user", input);
      setIsLoading(true);
      try {
        updateLastAssistant("🎨 Generating image...");
        const { imageUrl, text } = await generateImage(prompt);
        const content = text || `Generated image: "${prompt}"`;
        updateLastAssistant(content, imageUrl);
        await saveMessage("assistant", content, { imageUrl });
      } catch (err: any) {
        updateLastAssistant(`Failed: ${err.message}`);
        await saveMessage("assistant", `Failed: ${err.message}`);
      }
      setIsLoading(false); return;
    }

    const userMsg: Message = { role: "user", content: input, mode };
    addLocal(userMsg); await saveMessage("user", input);
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      await streamChat({
        messages: [...messages, userMsg], mode, answerStyle,
        onDelta: (chunk) => { assistantSoFar += chunk; updateLastAssistant(assistantSoFar); },
        onDone: async () => {
          setIsLoading(false);
          if (assistantSoFar) {
            await saveMessage("assistant", assistantSoFar);
            const codeBlocks = assistantSoFar.match(/```(\w+)?\n([\s\S]*?)```/g);
            if (codeBlocks?.length && assistantSoFar.length > 500) {
              const firstBlock = codeBlocks[0];
              const lang = firstBlock.match(/```(\w+)/)?.[1] || "text";
              const code = firstBlock.replace(/```\w*\n/, "").replace(/```$/, "");
              if (code.length > 200) handleCreateArtifact(`Generated ${lang}`, code, "code");
            }
          }
        },
        onError: (err) => { setIsLoading(false); toast.error(err); },
      });
    } catch { setIsLoading(false); toast.error("Failed to connect to Emma"); }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-background"><EmmaAvatar size="lg" /></div>;

  const showWelcome = messages.length === 0 && mode === "chat";
  const isChatMode = mode === "chat";

  const renderRightPanel = () => {
    switch (mode) {
      case "research": return <ResearchPanel onCreateArtifact={handleCreateArtifact} />;
      case "artifacts": return <ArtifactPanel artifacts={artifacts} onUpdate={handleUpdateArtifact} onCreate={handleCreateArtifact} onDelete={handleDeleteArtifact} />;
      case "think": return <ThinkPanel />;
      case "builder": return <BuilderPanel />;
      case "voice": return <VoicePanel />;
      case "data": return <DataAnalysisPanel />;
      case "memory": return <MemoryControlPanel />;
      default: return <InspectorPanel isProcessing={isLoading} />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <EmmaSidebar conversations={user ? conversations : []} activeId={activeConvId} onSelect={handleSelectConv} onCreate={handleNewChat} onDelete={remove} onRename={rename} onNavigate={navigate} onSignOut={user ? signOut : () => navigate("/sign-in")} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-auto flex flex-col border-b border-border bg-card">
            <div className="h-11 flex items-center px-3 gap-2">
              <SidebarTrigger />
              <div className="flex items-center gap-2 flex-1">
                <h1 className="text-sm font-semibold text-foreground">Emma</h1>
                <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">AI Workspace</span>
              </div>
              {isChatMode && (
                <div className="flex items-center gap-0.5 mr-2">
                  {(["concise", "standard", "deep", "direct"] as AnswerStyle[]).map(s => (
                    <button key={s} onClick={() => setAnswerStyle(s)} className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${answerStyle === s ? s === "direct" ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      {s === "direct" ? <span className="flex items-center gap-0.5"><Zap className="h-2 w-2" />{s}</span> : s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary emma-pulse" /><span className="text-xs font-mono text-primary">ONLINE</span></div>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={() => setShowRight(!showRight)}>
                {showRight ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>
            <div className="px-3 pb-2 overflow-x-auto"><ModeSwitcher mode={mode} onChange={setMode} compact /></div>
          </header>

          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={showRight ? 55 : 100} minSize={25}>
                <div className="flex flex-col h-full">
                  <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    <AnimatePresence mode="wait">
                      {showWelcome ? (
                        <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full px-6 py-12 gap-8">
                          <EmmaAvatar size="lg" />
                          <div className="text-center space-y-3 max-w-lg">
                            <h2 className="text-2xl font-bold emma-glow-text">Hello, I'm Emma</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">Your AI operating system — research, create, analyze, and build with autonomous agents, persistent memory, and source-grounded answers.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                            {WELCOME_SUGGESTIONS.map((s) => (
                              <button key={s.text} onClick={() => { setMode(s.mode); if (s.mode === "chat") checkUsageAndSend(s.text); }} className="emma-surface-elevated emma-glow-border rounded-xl px-4 py-3 text-xs text-secondary-foreground hover:bg-secondary transition-colors text-left space-y-1">
                                <span className="text-[9px] font-mono text-primary uppercase">{s.mode}</span>
                                <p>{s.text}</p>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto px-4 py-6 space-y-4">
                          {messages.map((m, i) => (
                            <ChatMessage key={i} message={m} index={i} conversationId={activeConvId} onBranch={handleBranch} onOpenInEditor={(code, lang) => handleCreateArtifact(`Code Snippet (${lang})`, code, "code")} />
                          ))}
                          {isLoading && messages[messages.length - 1]?.role === "user" && (
                            <div className="flex gap-3"><EmmaAvatar size="sm" /><TypingIndicator /></div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="max-w-3xl mx-auto w-full px-4 py-3">
                    <ChatInput onSend={checkUsageAndSend} disabled={isLoading} userId={user?.id || "anonymous"} />
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <p className="text-[10px] text-muted-foreground font-mono">Emma · {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode · {answerStyle}</p>
                      {!getLocalUsage().isPaid && (
                        <span className="text-[10px] font-mono text-primary">{remainingFreeMessages()} free messages left</span>
                      )}
                      {!user && (
                        <button onClick={() => navigate("/sign-in")} className="text-[10px] font-mono text-primary hover:underline">Sign in</button>
                      )}
                    </div>
                  </div>
                </div>
              </ResizablePanel>
              {showRight && (<><ResizableHandle withHandle /><ResizablePanel defaultSize={45} minSize={25}>{renderRightPanel()}</ResizablePanel></>)}
            </ResizablePanelGroup>
          </div>
        </div>
        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          onPaid={() => { setShowPaywall(false); markLocalPaid(); }}
          userEmail={user?.email}
          getToken={getToken}
        />
      </div>
    </SidebarProvider>
  );
}
