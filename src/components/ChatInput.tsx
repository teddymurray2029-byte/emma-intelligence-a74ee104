import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileUpload } from "./FileUpload";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  userId?: string;
}

export function ChatInput({ onSend, disabled, userId }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleFileUploaded = (url: string, fileName: string) => {
    onSend(`📎 Uploaded file: [${fileName}](${url})\n\nPlease analyze this file.`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // File drop is handled by FileUpload component via the input
    toast("Use the 📎 button to upload files");
  };

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied. Please enable it in browser settings.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  return (
    <div
      className="emma-glow-border rounded-2xl emma-surface-elevated p-2 flex items-end gap-1.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {userId ? (
        <FileUpload userId={userId} onFileUploaded={handleFileUploaded} disabled={disabled}>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground rounded-xl flex-shrink-0 h-9 w-9"
            disabled={disabled}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </FileUpload>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground rounded-xl flex-shrink-0 h-9 w-9"
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
      )}

      <Button
        size="icon"
        variant="ghost"
        onClick={toggleVoice}
        className={`rounded-xl flex-shrink-0 h-9 w-9 ${
          isListening ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground"
        }`}
        disabled={disabled}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>

      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={isListening ? "Listening..." : "Message Emma... (use /image to generate images)"}
        disabled={disabled}
        rows={1}
        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none px-2 py-2 max-h-40 font-sans"
      />

      <Button
        onClick={handleSubmit}
        disabled={disabled || !input.trim()}
        size="icon"
        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl flex-shrink-0 h-9 w-9"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
