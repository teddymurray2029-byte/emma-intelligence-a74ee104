import { useState } from "react";
import Editor from "@monaco-editor/react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileTab {
  name: string;
  language: string;
  content: string;
}

const DEFAULT_FILE: FileTab = {
  name: "main.tsx",
  language: "typescript",
  content: `// Welcome to Emma IDE\n// Open code blocks from chat to edit here\n\nexport default function App() {\n  return <h1>Hello, Emma</h1>;\n}\n`,
};

export function CodeEditor() {
  const [files, setFiles] = useState<FileTab[]>([DEFAULT_FILE]);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = files[activeIdx] || files[0];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center border-b border-border bg-card overflow-x-auto">
        {files.map((f, i) => (
          <button
            key={f.name}
            onClick={() => setActiveIdx(i)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-r border-border transition-colors ${
              i === activeIdx ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.name}
            {files.length > 1 && (
              <X className="h-3 w-3 opacity-50 hover:opacity-100" onClick={(e) => {
                e.stopPropagation();
                setFiles((prev) => prev.filter((_, j) => j !== i));
                if (activeIdx >= i && activeIdx > 0) setActiveIdx(activeIdx - 1);
              }} />
            )}
          </button>
        ))}
        <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={() => {
          const newFile: FileTab = { name: `file${files.length + 1}.ts`, language: "typescript", content: "" };
          setFiles((prev) => [...prev, newFile]);
          setActiveIdx(files.length);
        }}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={active.language}
          value={active.content}
          onChange={(val) => { setFiles((prev) => prev.map((f, i) => (i === activeIdx ? { ...f, content: val || "" } : f))); }}
          theme="vs-dark"
          options={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, padding: { top: 12 }, scrollBeyondLastLine: false, renderLineHighlight: "line", lineNumbers: "on", automaticLayout: true }}
        />
      </div>
    </div>
  );
}
