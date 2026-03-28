import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Download, FolderOpen, FolderPlus } from "lucide-react";
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
  onSelectProject: (project: Project) => void;
  getToken: () => Promise<string | null>;
}

export function ProjectManager({ activeProject, onSelectProject, getToken }: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await dbProxy("list_projects", {}, getToken);
      setProjects(res.data || []);
    } catch {}
  }, [getToken]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await dbProxy("create_project", { name: newName.trim(), description: newDesc.trim() }, getToken);
      if (res.data) {
        onSelectProject(res.data);
        await loadProjects();
        setNewName(""); setNewDesc(""); setDialogOpen(false);
        toast.success("Project created!");
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await dbProxy("delete_project", { id }, getToken);
      setProjects((p) => p.filter((pr) => pr.id !== id));
      if (activeProject?.id === id) onSelectProject(null as any);
      toast.success("Project deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleExportZip = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    for (const f of activeProject.files) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProject.name.replace(/\s+/g, "_")}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Project exported as ZIP!");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Projects</span>
        <div className="flex items-center gap-1">
          {activeProject && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExportZip} title="Export as ZIP">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6"><FolderPlus className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                <Button onClick={handleCreate} disabled={loading || !newName.trim()} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Create Project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {projects.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No projects yet.</div>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-secondary/50 transition-colors ${activeProject?.id === p.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
              onClick={() => onSelectProject(p)}
            >
              <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{p.description || "No description"}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
