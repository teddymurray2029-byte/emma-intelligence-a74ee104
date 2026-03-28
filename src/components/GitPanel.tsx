import { useState } from "react";
import { GitBranch, GitCommit, ArrowUp, ArrowDown, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Project } from "./ProjectManager";
import type { ProjectFile } from "./FileExplorer";

const GITHUB_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-github`;

interface GitPanelProps {
  project: Project | null;
  files: ProjectFile[];
  onFilesChange: (files: ProjectFile[]) => void;
  onRepoConnect: (repo: string) => void;
  getToken: () => Promise<string | null>;
}

async function githubApi(action: string, params: Record<string, any>, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const resp = await fetch(GITHUB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...params }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  return resp.json();
}

export function GitPanel({ project, files, onFilesChange, onRepoConnect, getToken }: GitPanelProps) {
  const [repoUrl, setRepoUrl] = useState(project?.github_repo || "");
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!repoUrl.trim()) return;
    onRepoConnect(repoUrl.trim());
    toast.success("Repository connected!");
  };

  const handlePush = async () => {
    if (!project?.github_repo) { toast.error("Connect a repo first"); return; }
    if (!commitMsg.trim()) { toast.error("Enter a commit message"); return; }
    setLoading("push");
    try {
      await githubApi("push", {
        repo: project.github_repo,
        files: files.map((f) => ({ path: f.path, content: f.content })),
        message: commitMsg.trim(),
      }, getToken);
      toast.success("Pushed to GitHub!");
      setCommitMsg("");
    } catch (e: any) { toast.error(e.message); }
    setLoading(null);
  };

  const handlePull = async () => {
    if (!project?.github_repo) { toast.error("Connect a repo first"); return; }
    setLoading("pull");
    try {
      const res = await githubApi("pull", { repo: project.github_repo }, getToken);
      if (res.files) {
        onFilesChange(res.files);
        toast.success(`Pulled ${res.files.length} files`);
      }
    } catch (e: any) { toast.error(e.message); }
    setLoading(null);
  };

  const handleCommit = async () => {
    if (!project?.github_repo) { toast.error("Connect a repo first"); return; }
    if (!commitMsg.trim()) { toast.error("Enter a commit message"); return; }
    setLoading("commit");
    try {
      await githubApi("commit", {
        repo: project.github_repo,
        files: files.map((f) => ({ path: f.path, content: f.content })),
        message: commitMsg.trim(),
      }, getToken);
      toast.success("Committed!");
      setCommitMsg("");
    } catch (e: any) { toast.error(e.message); }
    setLoading(null);
  };

  return (
    <div className="flex flex-col h-full bg-card border-t border-border">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Source Control</span>
      </div>
      <div className="p-3 space-y-3 overflow-auto flex-1">
        {/* Connect Repo */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">GitHub Repository</label>
          <div className="flex gap-1.5">
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="owner/repo"
              className="h-7 text-xs"
            />
            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={handleConnect}>
              <Link className="h-3 w-3 mr-1" /> Connect
            </Button>
          </div>
        </div>

        {project?.github_repo && (
          <>
            <div className="text-[10px] text-muted-foreground font-mono px-1">
              Connected: <span className="text-primary">{project.github_repo}</span>
            </div>

            {/* Commit Message */}
            <Input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              className="h-7 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") handleCommit(); }}
            />

            {/* Actions */}
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs flex-1" onClick={handleCommit} disabled={!!loading}>
                {loading === "commit" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <GitCommit className="h-3 w-3 mr-1" />}
                Commit
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs flex-1" onClick={handlePush} disabled={!!loading}>
                {loading === "push" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowUp className="h-3 w-3 mr-1" />}
                Push
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs flex-1" onClick={handlePull} disabled={!!loading}>
                {loading === "pull" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                Pull
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
