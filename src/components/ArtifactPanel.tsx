import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCode2, Plus, Trash2, History, Edit3, Check, X,
  FileText, Code2, Globe, ListChecks, Table2, Terminal,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Artifact } from "@/lib/emma-stream";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

const ARTIFACT_ICONS: Record<string, React.ElementType> = {
  text: FileText,
  markdown: FileText,
  code: Code2,
  html: Globe,
  react: Code2,
  plan: ListChecks,
  report: FileText,
  table: Table2,
  prompt: Terminal,
};

interface ArtifactPanelProps {
  artifacts: Artifact[];
  onUpdate: (id: string, content: string) => void;
  onCreate: (title: string, content: string, type: string) => void;
  onDelete: (id: string) => void;
}

export function ArtifactPanel({ artifacts, onUpdate, onCreate, onDelete }: ArtifactPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(artifacts[0]?.id || null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("markdown");

  const active = artifacts.find(a => a.id === activeId);

  const startEdit = useCallback(() => {
    if (!active) return;
    setEditContent(active.content);
    setEditing(true);
  }, [active]);

  const saveEdit = useCallback(() => {
    if (!active) return;
    onUpdate(active.id, editContent);
    setEditing(false);
  }, [active, editContent, onUpdate]);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim()) return;
    onCreate(newTitle.trim(), "", newType);
    setCreating(false);
    setNewTitle("");
  }, [newTitle, newType, onCreate]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 border-r border-border flex flex-col bg-card/50">
        <div className="p-2 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5 h-7 text-xs"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3 w-3" />
            New Artifact
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {artifacts.map((a) => {
              const Icon = ARTIFACT_ICONS[a.type] || FileText;
              return (
                <button
                  key={a.id}
                  onClick={() => { setActiveId(a.id); setEditing(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group ${
                    activeId === a.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span className="text-[10px] truncate flex-1">{a.title}</span>
                  <span className="text-[8px] font-mono text-muted-foreground">v{a.version}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {creating ? (
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">New Artifact</h3>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Artifact title..."
              className="w-full bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex flex-wrap gap-1">
              {Object.keys(ARTIFACT_ICONS).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`text-[10px] px-2 py-1 rounded-full ${
                    newType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} size="sm" className="h-7 text-xs" disabled={!newTitle.trim()}>
                <Check className="h-3 w-3 mr-1" /> Create
              </Button>
              <Button onClick={() => setCreating(false)} size="sm" variant="ghost" className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : active ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50">
              <span className="text-xs font-medium text-foreground truncate flex-1">{active.title}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{active.type}</span>
              <span className="text-[10px] font-mono text-muted-foreground">v{active.version}</span>
              {editing ? (
                <>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={saveEdit}>
                    <Check className="h-3 w-3 mr-1" /> Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={startEdit}>
                    <Edit3 className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowVersions(!showVersions)}>
                    <History className="h-3 w-3 mr-1" /> {active.versions.length}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => onDelete(active.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>

            {/* Version history */}
            <AnimatePresence>
              {showVersions && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-b border-border">
                  <div className="p-2 space-y-1 max-h-32 overflow-auto">
                    {active.versions.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => { onUpdate(active.id, v.content); setShowVersions(false); }}
                        className="w-full text-left px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded"
                      >
                        v{i + 1} — {new Date(v.timestamp).toLocaleString()} — {v.content.length} chars
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Content */}
            <ScrollArea className="flex-1">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-transparent text-foreground text-sm font-mono p-4 outline-none resize-none"
                />
              ) : (
                <div className="p-4">
                  {(active.type === "markdown" || active.type === "report" || active.type === "text") ? (
                    <div className="prose prose-sm prose-invert max-w-none text-foreground [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-primary [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground">
                      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                        {active.content || "*Empty artifact. Click Edit to add content.*"}
                      </ReactMarkdown>
                    </div>
                  ) : active.type === "html" ? (
                    <iframe
                      srcDoc={active.content}
                      className="w-full h-96 rounded-lg border border-border bg-white"
                      sandbox="allow-scripts"
                    />
                  ) : (
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap bg-secondary/30 rounded-lg p-3">
                      {active.content || "// Empty artifact. Click Edit to add content."}
                    </pre>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileCode2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No artifacts yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Create one or ask Emma to generate documents, code, or reports</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
