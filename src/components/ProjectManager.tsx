import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Download, FolderOpen, FolderPlus, GitBranch, Search, Clock, Folder, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { dbProxy } from "@/lib/db-proxy";
import { toast } from "sonner";
import JSZip from "jszip";
import type { ProjectFile } from "./FileExplorer";

export interface Project {
  id: string;
  name: string;
  description: string;
  files: ProjectFile[];
  github_repo: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectManagerProps {
  activeProject: Project | null;
  onSelectProject: (project: Project | null) => void;
  getToken: () => Promise<string | null>;
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function ProjectManager({ activeProject, onSelectProject, getToken }: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const res = await dbProxy("list_projects", {}, getToken);
      setProjects(res.data || []);
    } catch {}
  }, [getToken]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
  }, [projects, search]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await dbProxy("create_project", { name: newName.trim(), description: newDesc.trim() }, getToken);
      if (res.data) {
        onSelectProject(res.data);
        await loadProjects();
        setNewName(""); setNewDesc(""); setDialogOpen(false);
        toast.success("Project created");
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const handleClone = async () => {
    const url = cloneUrl.trim();
    if (!url) return;
    setLoading(true);
    try {
      // Accept owner/repo or full https URL
      const m = url.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s.]+)/);
      if (!m) throw new Error("Invalid repo (use owner/repo or full URL)");
      const repo = `${m[1]}/${m[2]}`;
      const res = await dbProxy("create_project", { name: m[2], description: `Cloned from ${repo}`, github_repo: repo }, getToken);
      if (res.data) {
        onSelectProject(res.data);
        await loadProjects();
        setCloneUrl(""); setCloneOpen(false);
        toast.success(`Linked ${repo} — pull from Source Control to fetch files`);
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await dbProxy("delete_project", { id }, getToken);
      setProjects((p) => p.filter((pr) => pr.id !== id));
      if (activeProject?.id === id) onSelectProject(null);
      toast.success("Deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleExportZip = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    for (const f of activeProject.files) zip.file(f.path, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeProject.name.replace(/\s+/g, "_")}.zip`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as ZIP");
  };

  const handleImportZip = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const zip = await JSZip.loadAsync(file);
        const newFiles: ProjectFile[] = [];
        const tasks: Promise<void>[] = [];
        zip.forEach((path, entry) => {
          if (entry.dir || path.startsWith("__MACOSX") || path.startsWith(".git/")) return;
          tasks.push(entry.async("string").then((c) => { newFiles.push({ path, content: c }); }));
        });
        await Promise.all(tasks);
        const name = file.name.replace(/\.zip$/i, "");
        const res = await dbProxy("create_project", { name, description: `Imported ${newFiles.length} files`, files: newFiles }, getToken);
        if (res.data) {
          onSelectProject(res.data);
          await loadProjects();
          toast.success(`Imported ${newFiles.length} files`);
        }
      } catch (e: any) { toast.error(e.message); }
      setLoading(false);
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Projects</span>
        <div className="flex items-center gap-0.5">
          {activeProject && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExportZip} title="Export ZIP">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleImportZip} title="Import ZIP">
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Clone repo">
                <GitBranch className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Clone repository</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="owner/repo or https://github.com/owner/repo" value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} autoFocus />
                <Button onClick={handleClone} disabled={loading || !cloneUrl.trim()} className="w-full">
                  <GitBranch className="h-4 w-4 mr-2" /> Clone
                </Button>
                <p className="text-[11px] text-muted-foreground">Creates a project linked to the repo. Use Source Control → Pull to fetch files.</p>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="New project"><FolderPlus className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                <Button onClick={handleCreate} disabled={loading || !newName.trim()} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {projects.length === 0 ? (
        // Cursor-style welcome
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center mb-3 shadow-lg shadow-primary/20">
            <Folder className="h-6 w-6 text-primary-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Emma IDE</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Start a project to code, run, and ship.</p>
          <div className="grid grid-cols-1 gap-2 w-full max-w-[200px]">
            <button onClick={() => setDialogOpen(true)} className="group flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background/50 hover:bg-secondary/60 hover:border-primary/40 transition-all text-left">
              <FolderPlus className="h-4 w-4 text-primary flex-shrink-0" />
              <div>
                <div className="text-xs font-medium">New project</div>
                <div className="text-[10px] text-muted-foreground">Empty workspace</div>
              </div>
            </button>
            <button onClick={() => setCloneOpen(true)} className="group flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background/50 hover:bg-secondary/60 hover:border-primary/40 transition-all text-left">
              <GitBranch className="h-4 w-4 text-primary flex-shrink-0" />
              <div>
                <div className="text-xs font-medium">Clone repo</div>
                <div className="text-[10px] text-muted-foreground">From GitHub</div>
              </div>
            </button>
            <button onClick={handleImportZip} className="group flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background/50 hover:bg-secondary/60 hover:border-primary/40 transition-all text-left">
              <Upload className="h-4 w-4 text-primary flex-shrink-0" />
              <div>
                <div className="text-xs font-medium">Import ZIP</div>
                <div className="text-[10px] text-muted-foreground">From your machine</div>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-2 py-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-7 pl-7 text-xs bg-background/50"
              />
            </div>
          </div>
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-b border-border/50 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Recent
          </div>
          <ScrollArea className="flex-1">
            {filtered.map((p) => {
              const isActive = activeProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`group flex items-start gap-2 px-3 py-2 cursor-pointer transition-all border-l-2 ${
                    isActive ? "bg-primary/10 border-primary" : "border-transparent hover:bg-secondary/40 hover:border-primary/40"
                  }`}
                  onClick={() => onSelectProject(p)}
                >
                  <FolderOpen className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <span className="text-[9px] text-muted-foreground/60 flex-shrink-0">{timeAgo(p.updated_at)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {p.github_repo ? <span className="inline-flex items-center gap-0.5"><GitBranch className="h-2.5 w-2.5" />{p.github_repo}</span> : (p.description || `${(p.files || []).length} files`)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0" onClick={(e) => handleDelete(p.id, e)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground text-center">No matches</div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}
