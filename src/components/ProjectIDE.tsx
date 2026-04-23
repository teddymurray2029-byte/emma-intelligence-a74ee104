import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FileExplorer, type ProjectFile } from "./FileExplorer";
import { ProjectManager, type Project } from "./ProjectManager";
import { GitPanel } from "./GitPanel";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Folder, Search as SearchIcon, GitBranch, Blocks } from "lucide-react";
import { dbProxy } from "@/lib/db-proxy";
import { setIdeContext } from "@/lib/ide-context";
import { toast } from "sonner";

interface ProjectIDEProps {
  getToken: () => Promise<string | null>;
}

type SideTab = "explorer" | "search" | "scm" | "ext";

export function ProjectIDE({ getToken }: ProjectIDEProps) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [sideTab, setSideTab] = useState<SideTab>("explorer");
  const editorRef = useRef<CodeEditorHandle>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (activeProject) {
      setFiles(activeProject.files || []);
      setSelectedFile(undefined);
    }
  }, [activeProject]);

  // Broadcast project & files context for the floating chat
  useEffect(() => {
    setIdeContext({
      projectName: activeProject?.name,
      projectId: activeProject?.id,
      githubRepo: activeProject?.github_repo ?? null,
      files: files.map(f => ({ path: f.path })),
      // stash full files on context so the chat's commit/push can use them without prop drilling
      ...({ __fullFiles: files } as any),
    });
  }, [activeProject, files]);

  const persistFiles = useCallback(async (newFiles: ProjectFile[]) => {
    if (!activeProject) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await dbProxy("update_project_files", { id: activeProject.id, files: newFiles }, getToken);
      } catch {}
    }, 1500);
  }, [activeProject, getToken]);

  const handleFilesChange = useCallback((newFiles: ProjectFile[]) => {
    setFiles(newFiles);
    if (activeProject) setActiveProject((p) => p ? { ...p, files: newFiles } : p);
    persistFiles(newFiles);
  }, [activeProject, persistFiles]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
    const file = files.find((f) => f.path === path);
    if (file && editorRef.current) {
      const ext = path.split(".").pop() || "";
      const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", css: "css", html: "html", json: "json", md: "markdown" };
      const lang = langMap[ext] || "plaintext";
      editorRef.current.openCode(file.content, lang, path);
      setIdeContext({ activeFile: { path, language: lang, content: file.content } });
    }
  }, [files]);

  // Allow the floating chat to apply edits directly to a file
  const handleApplyToFile = useCallback((path: string, content: string) => {
    const next = files.map(f => f.path === path ? { ...f, content } : f);
    if (!files.some(f => f.path === path)) next.push({ path, content });
    handleFilesChange(next);
    setIdeContext({ activeFile: { path, language: path.split(".").pop() || "plaintext", content } });
    toast.success(`Updated ${path}`);
  }, [files, handleFilesChange]);

  // Expose for FloatingChat (mounted in Index)
  useEffect(() => {
    (window as any).__emmaApplyToFile = handleApplyToFile;
    return () => { delete (window as any).__emmaApplyToFile; };
  }, [handleApplyToFile]);

  const handleRepoConnect = useCallback(async (repo: string) => {
    if (!activeProject) return;
    try {
      await dbProxy("update_project", { id: activeProject.id, updates: { github_repo: repo } }, getToken);
      setActiveProject((p) => p ? { ...p, github_repo: repo } : p);
    } catch (e: any) { toast.error(e.message); }
  }, [activeProject, getToken]);

  return (
    <div className="flex h-full bg-background">
      <ActivityBar active={sideTab} onChange={setSideTab} />
      <div className="flex-1 min-w-0">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
            {sideTab === "explorer" && (
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel defaultSize={38} minSize={20}>
                  <ProjectManager activeProject={activeProject} onSelectProject={setActiveProject} getToken={getToken} />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={62} minSize={30}>
                  <FileExplorer files={files} onFileSelect={handleFileSelect} onFilesChange={handleFilesChange} selectedFile={selectedFile} />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
            {sideTab === "search" && (
              <SearchPanel files={files} onSelect={handleFileSelect} />
            )}
            {sideTab === "scm" && (
              <ScmSidePanel project={activeProject} files={files} onFilesChange={handleFilesChange} onRepoConnect={handleRepoConnect} getToken={getToken} />
            )}
            {sideTab === "ext" && <ExtensionsPanel />}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={78} minSize={40}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={75} minSize={30}>
                <CodeEditor ref={editorRef} getToken={getToken} />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={15}>
                <GitPanel project={activeProject} files={files} onFilesChange={handleFilesChange} onRepoConnect={handleRepoConnect} getToken={getToken} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function ActivityBar({ active, onChange }: { active: SideTab; onChange: (t: SideTab) => void }) {
  const items: { id: SideTab; label: string; icon: React.ElementType }[] = [
    { id: "explorer", label: "Explorer", icon: Folder },
    { id: "search", label: "Search", icon: SearchIcon },
    { id: "scm", label: "Source Control", icon: GitBranch },
    { id: "ext", label: "Extensions", icon: Blocks },
  ];
  return (
    <div className="w-11 bg-card border-r border-border flex flex-col items-center py-2 gap-1">
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            title={it.label}
            onClick={() => onChange(it.id)}
            className={`relative w-9 h-9 flex items-center justify-center rounded-md transition-all ${
              isActive ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
            <it.icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function SearchPanel({ files, onSelect }: { files: ProjectFile[]; onSelect: (path: string) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    const out: { path: string; line: number; preview: string }[] = [];
    for (const f of files) {
      const lines = f.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          out.push({ path: f.path, line: i + 1, preview: lines[i].trim().slice(0, 140) });
          if (out.length > 200) return out;
        }
      }
    }
    return out;
  }, [q, files]);

  return (
    <div className="h-full bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider">Search</span>
      </div>
      <div className="p-2 border-b border-border">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search across project…"
          className="h-7 text-xs"
          autoFocus
        />
        {q && <div className="text-[10px] text-muted-foreground mt-1">{results.length} match{results.length === 1 ? "" : "es"}</div>}
      </div>
      <ScrollArea className="flex-1">
        {!q && <div className="p-4 text-[11px] text-muted-foreground text-center">Type to search file contents.</div>}
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => onSelect(r.path)}
            className="w-full text-left px-3 py-1.5 hover:bg-secondary/40 border-b border-border/40"
          >
            <div className="text-[10px] text-primary font-mono truncate">{r.path}:{r.line}</div>
            <div className="text-[11px] text-muted-foreground truncate font-mono">{r.preview}</div>
          </button>
        ))}
      </ScrollArea>
    </div>
  );
}

function ScmSidePanel({ project, files, onFilesChange, onRepoConnect, getToken }: { project: Project | null; files: ProjectFile[]; onFilesChange: (f: ProjectFile[]) => void; onRepoConnect: (r: string) => void; getToken: () => Promise<string | null> }) {
  return (
    <div className="h-full bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider">Source Control</span>
      </div>
      <div className="flex-1 overflow-auto">
        <GitPanel project={project} files={files} onFilesChange={onFilesChange} onRepoConnect={onRepoConnect} getToken={getToken} />
      </div>
    </div>
  );
}

function ExtensionsPanel() {
  const ext = [
    { name: "Emma AI Assistant", desc: "Context-aware in-IDE chat", installed: true },
    { name: "Sandbox VM Terminal", desc: "Real Linux shell via E2B", installed: true },
    { name: "GitHub Sync", desc: "Pull/commit/push from sidebar", installed: true },
    { name: "Monaco Editor", desc: "VS Code editor core", installed: true },
    { name: "Project Auto-save", desc: "Persist files to backend", installed: true },
    { name: "ZIP Import / Export", desc: "Pack & unpack workspaces", installed: true },
  ];
  return (
    <div className="h-full bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider">Extensions</span>
      </div>
      <ScrollArea className="flex-1">
        {ext.map((e) => (
          <div key={e.name} className="px-3 py-2 border-b border-border/40 hover:bg-secondary/40">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium truncate">{e.name}</div>
              <span className="text-[9px] font-mono text-green-400 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">installed</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{e.desc}</div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
