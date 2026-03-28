import { useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceOutputProps {
  text: string;
}

export function VoiceOutput({ text }: VoiceOutputProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const toggle = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Strip markdown for cleaner TTS
    const clean = text
      .replace(/```[\s\S]*?```/g, "code block omitted")
      .replace(/[#*_~`>\[\]()!]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }, [text, isSpeaking]);

  if (!("speechSynthesis" in window)) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
      onClick={toggle}
    >
      {isSpeaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      {isSpeaking ? "Stop" : "Listen"}
    </Button>
  );
}
