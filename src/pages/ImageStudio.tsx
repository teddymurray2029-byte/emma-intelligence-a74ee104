import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ImageIcon, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-image-gen`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Gen {
  prompt: string;
  text: string;
  imageUrl: string | null;
  createdAt: number;
}

function extractImageUrl(text: string): string | null {
  // Look for data: URLs or markdown image references in the AI response
  const md = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/);
  if (md) return md[1];
  const url = text.match(/(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|webp|gif))/i);
  if (url) return url[1];
  const data = text.match(/(data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+)/);
  if (data) return data[1];
  return null;
}

export default function ImageStudio() {
  const { getToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [gens, setGens] = useState<Gen[]>([]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const token = (await getToken?.()) ?? ANON;
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
        body: JSON.stringify({ prompt }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "Image generation failed");
      } else {
        const img = j.imageUrl || extractImageUrl(j.text || "");
        setGens((g) => [{ prompt, text: j.text || "", imageUrl: img, createdAt: Date.now() }, ...g]);
        toast.success("Generated");
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <ImageIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Image Studio</h1>
            <p className="text-xs text-muted-foreground">Generate images via Gemini 3 Pro Image</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <Card className="p-4 space-y-3">
          <Textarea
            placeholder="Describe the image — e.g. 'A cyberpunk samurai meditating in a neon rain-soaked alley, cinematic, ultra-detailed'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={generate} disabled={busy || !prompt.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ImageIcon className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </div>
        </Card>

        {gens.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">No images yet — generate one above.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gens.map((g) => (
            <Card key={g.createdAt} className="p-3 space-y-3">
              {g.imageUrl ? (
                <div className="relative group">
                  <img src={g.imageUrl} alt={g.prompt} className="w-full rounded-md" />
                  <a
                    href={g.imageUrl}
                    download={`emma-${g.createdAt}.png`}
                    className="absolute top-2 right-2 p-2 bg-background/80 rounded opacity-0 group-hover:opacity-100 transition"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap p-2 bg-muted/40 rounded">
                  {g.text || "(no image returned)"}
                </div>
              )}
              <p className="text-xs text-muted-foreground line-clamp-2">{g.prompt}</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
