import { useState, useCallback, useRef, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FileExplorer, type ProjectFile } from "./FileExplorer";
import { ProjectManager, type Project } from "./ProjectManager";
import { GitPanel } from "./GitPanel";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { dbProxy } from "@/lib/db-proxy";
import { toast } from "sonner";
import JSZip from "jszip";

interface ProjectIDEProps {
  getToken: () => Promise<string | null>;
}

export function ProjectIDE({ getToken }: ProjectIDEProps) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const editorRef = useRef<CodeEditorHandle>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (activeProject) {
      setFiles(activeProject.files || []);
      setSelectedFile(undefined);
    }
  }, [activeProject]);

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
    if (activeProject) {
      setActiveProject((p) => p ? { ...p, files: newFiles } : p);
    }
    persistFiles(newFiles);
  }, [activeProject, persistFiles]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFile(path);
    const file = files.find((f) => f.path === path);
    if (file && editorRef.current) {
      const ext = path.split(".").pop() || "";
      const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", css: "css", html: "html", json: "json", md: "markdown" };
      editorRef.current.openCode(file.content, langMap[ext] || "plaintext");
    }
  }, [files]);

  const handleRepoConnect = useCallback(async (repo: string) => {
    if (!activeProject) return;
    try {
      await dbProxy("update_project", { id: activeProject.id, updates: { github_repo: repo } }, getToken);
      setActiveProject((p) => p ? { ...p, github_repo: repo } : p);
    } catch (e: any) { toast.error(e.message); }
  }, [activeProject, getToken]);

  const handleZipImport = useCallback(async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const newFiles: ProjectFile[] = [];
      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        if (relativePath.startsWith("__MACOSX") || relativePath.startsWith(".")) return;
        promises.push(
          entry.async("string").then((content) => {
            newFiles.push({ path: relativePath, content });
          })
        );
      });
      await Promise.all(promises);
      handleFilesChange([...files, ...newFiles]);
      toast.success(`Extracted ${newFiles.length} files from ZIP`);
    } catch (e: any) {
      toast.error("Failed to extract ZIP: " + e.message);
    }
  }, [files, handleFilesChange]);

  return (
    <div className="flex h-full bg-background">
      <ActivityBar />
      <div className="flex-1 min-w-0">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={38} minSize={20}>
                <ProjectManager activeProject={activeProject} onSelectProject={setActiveProject} getToken={getToken} />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={62} minSize={30}>
                <FileExplorer files={files} onFileSelect={handleFileSelect} onFilesChange={handleFilesChange} selectedFile={selectedFile} />
              </ResizablePanel>
            </ResizablePanelGroup>
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

function ActivityBar() {
  const items = [
    { id: "explorer", label: "Explorer", active: true,
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg> },
    { id: "search", label: "Search",
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg> },
    { id: "scm", label: "Source Control",
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 8v8M8 18h6a4 4 0 0 0 4-4v-2"/></svg> },
    { id: "ext", label: "Extensions",
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"/></svg> },
  ];
  return (
    <div className="w-11 bg-card border-r border-border flex flex-col items-center py-2 gap-1">
      {items.map((it) => (
        <button
          key={it.id}
          title={it.label}
          className={`relative w-9 h-9 flex items-center justify-center rounded-md transition-all ${
            it.active
              ? "text-foreground bg-secondary/60"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          }`}
        >
          {it.active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
          {it.icon}
        </button>
      ))}
    </div>
  );
}
