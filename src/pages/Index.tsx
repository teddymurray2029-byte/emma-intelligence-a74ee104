import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { AetherAvatar } from "@/components/AetherAvatar";
import { RightPanel } from "@/components/RightPanel";
import { AetherSidebar } from "@/components/AetherSidebar";
import { streamChat, type Message } from "@/lib/emma-stream";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const WELCOME_SUGGESTIONS = [
  "Build me a landing page",
  "Explain quantum computing",
  "Analyze this dataset",
  "Design a REST API",
];

export default function Index() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { conversations, create, remove } = useConversations(user?.id);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const { messages, load: loadMessages, saveMessage, addLocal, updateLastAssistant, setMessages } = useMessages(activeConvId);
  const [isLoading, setIsLoading] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    loadMessages();
  }, [activeConvId, loadMessages]);

  const handleNewChat = useCallback(async () => {
    const conv = await create();
    if (conv) setActiveConvId(conv.id);
  }, [create]);

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
  };

  const send = async (input: string) => {
    let convId = activeConvId;

    // Auto-create conversation if none active
    if (!convId) {
      const conv = await create(input.slice(0, 60));
      if (!conv) { toast.error("Failed to create conversation"); return; }
      convId = conv.id;
      setActiveConvId(conv.id);
    } else {
      // Auto-title on first message
      if (messages.length === 0) {
        await supabase.from("conversations").update({ title: input.slice(0, 60) }).eq("id", convId);
      }
    }

    const userMsg: Message = { role: "user", content: input };
    addLocal(userMsg);
    await saveMessage("user", input);
    setIsLoading(true);

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

    try {
      await streamChat({
        messages: allMessages,
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          updateLastAssistant(assistantSoFar);
        },
        onDone: async () => {
          setIsLoading(false);
          if (assistantSoFar) {
            await saveMessage("assistant", assistantSoFar);
          }
        },
        onError: (err) => {
          setIsLoading(false);
          toast.error(err);
        },
      });
    } catch {
      setIsLoading(false);
      toast.error("Failed to connect to Aether");
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <AetherAvatar size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  const showWelcome = messages.length === 0;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AetherSidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConv}
          onCreate={handleNewChat}
          onDelete={remove}
          onNavigate={navigate}
          onSignOut={signOut}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-12 flex items-center border-b border-border bg-card px-3 gap-2">
            <SidebarTrigger />
            <div className="flex items-center gap-2 flex-1">
              <h1 className="text-sm font-semibold text-foreground">Aether</h1>
              <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                ASI v1.0
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary aether-pulse" />
              <span className="text-xs font-mono text-primary">ONLINE</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-2"
              onClick={() => setShowRight(!showRight)}
            >
              {showRight ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </header>

          {/* Main content */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              {/* Chat panel */}
              <ResizablePanel defaultSize={showRight ? 55 : 100} minSize={35}>
                <div className="flex flex-col h-full">
                  <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    <AnimatePresence mode="wait">
                      {showWelcome ? (
                        <motion.div
                          key="welcome"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center h-full px-6 py-12 gap-8"
                        >
                          <AetherAvatar size="lg" />
                          <div className="text-center space-y-3 max-w-lg">
                            <h2 className="text-2xl font-bold aether-glow-text">
                              Hello, I'm Aether
                            </h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              Your personal AI Operating System — an entire team of researchers,
                              engineers, designers and analysts working for you 24/7.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                            {WELCOME_SUGGESTIONS.map((s) => (
                              <button
                                key={s}
                                onClick={() => send(s)}
                                className="aether-surface-elevated aether-glow-border rounded-xl px-4 py-3 text-xs text-secondary-foreground hover:bg-secondary transition-colors text-left"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="chat"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="max-w-3xl mx-auto px-4 py-6 space-y-4"
                        >
                          {messages.map((m, i) => (
                            <ChatMessage key={i} message={m} />
                          ))}
                          {isLoading && messages[messages.length - 1]?.role === "user" && (
                            <div className="flex gap-3">
                              <AetherAvatar size="sm" />
                              <TypingIndicator />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="max-w-3xl mx-auto w-full px-4 py-3">
                    <ChatInput onSend={send} disabled={isLoading} />
                    <p className="text-[10px] text-center text-muted-foreground mt-2 font-mono">
                      Aether ASI · Multi-Agent · Unlimited Context
                    </p>
                  </div>
                </div>
              </ResizablePanel>

              {/* Right panel */}
              {showRight && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={45} minSize={25}>
                    <RightPanel />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
