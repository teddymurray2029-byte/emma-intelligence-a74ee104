import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { streamChat, type Message } from "@/lib/emma-stream";
import { EmmaAvatar } from "./EmmaAvatar";
import { toast } from "sonner";

export function VoicePanel() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_\[\]]/g, "").slice(0, 1000));
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const sendVoiceMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    let assistantSoFar = "";
    try {
      await streamChat({
        messages: [...messages, userMsg],
        mode: "voice",
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { role: "assistant", content: assistantSoFar }];
          });
        },
        onDone: () => {
          setIsProcessing(false);
          if (assistantSoFar) speak(assistantSoFar);
        },
        onError: (err) => {
          setIsProcessing(false);
          toast.error(err);
        },
      });
    } catch {
      setIsProcessing(false);
      toast.error("Failed to connect");
    }
  }, [messages, speak]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      if (transcript.trim()) {
        sendVoiceMessage(transcript.trim());
        setTranscript("");
      }
      return;
    }

    window.speechSynthesis?.cancel();
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        final += event.results[i][0].transcript;
      }
      setTranscript(final);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, transcript, sendVoiceMessage]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return (
    <div className="flex flex-col h-full items-center">
      {/* Conversation */}
      <ScrollArea className="flex-1 w-full">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && <EmmaAvatar size="sm" />}
              <div className={`rounded-2xl px-3 py-2 max-w-[80%] ${
                m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "emma-surface-elevated emma-glow-border rounded-bl-sm"
              }`}>
                <p className="text-xs">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Live transcript */}
      {transcript && (
        <div className="w-full max-w-lg mx-auto px-4">
          <div className="emma-surface-elevated rounded-xl p-2 text-center">
            <p className="text-xs text-muted-foreground font-mono">{transcript}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="p-6 flex flex-col items-center gap-4">
        {/* Avatar / Pulse */}
        <div className="relative">
          <AnimatePresence>
            {(isListening || isSpeaking) && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-primary/20"
                style={{ margin: "-16px" }}
              />
            )}
          </AnimatePresence>
          <EmmaAvatar size="lg" />
          {isProcessing && (
            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary-foreground" />
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground font-mono">
          {isListening ? "LISTENING..." : isSpeaking ? "SPEAKING..." : isProcessing ? "THINKING..." : "TAP TO SPEAK"}
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => { setTtsEnabled(!ttsEnabled); if (isSpeaking) window.speechSynthesis?.cancel(); }}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
          </Button>

          <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-destructive text-destructive-foreground scale-110"
                : "bg-primary text-primary-foreground hover:scale-105"
            }`}
          >
            {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setMessages([])}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}
