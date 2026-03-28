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
    <div className="flex flex-col h-full bg-background">
      <ResizablePanelGroup direction="horizontal">
        {/* Project list + File explorer */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={35} minSize={20}>
              <ProjectManager activeProject={activeProject} onSelectProject={setActiveProject} getToken={getToken} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={65} minSize={30}>
              <FileExplorer files={files} onFileSelect={handleFileSelect} onFilesChange={handleFilesChange} selectedFile={selectedFile} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        {/* Editor + Git */}
        <ResizablePanel defaultSize={80} minSize={40}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={75} minSize={30}>
              <CodeEditor ref={editorRef} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={25} minSize={15}>
              <GitPanel project={activeProject} files={files} onFilesChange={handleFilesChange} onRepoConnect={handleRepoConnect} getToken={getToken} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
