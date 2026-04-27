import { useState } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace } from "@/lib/pm-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ProjectSettings() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const [name, setName] = useState(workspace.name);
  const [desc, setDesc] = useState(workspace.description);
  const [repo, setRepo] = useState(workspace.github_repo || "");

  const isAdmin = workspace.my_role === "admin";

  const save = async () => {
    try {
      await pmApi.updateWorkspace(id!, { name, description: desc, github_repo: repo || null }, getToken);
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async () => {
    if (!confirm(`Delete project "${workspace.name}"? This cannot be undone.`)) return;
    try {
      await pmApi.deleteWorkspace(id!, getToken);
      toast.success("Deleted");
      nav("/projects");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card className="p-5">
        <h3 className="font-semibold mb-4">Project details</h3>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} className="mt-1" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!isAdmin} className="mt-1" />
          </div>
          <div>
            <Label>GitHub repo (owner/repo)</Label>
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} disabled={!isAdmin} className="mt-1" placeholder="myorg/myrepo" />
          </div>
          <Button onClick={save} disabled={!isAdmin}>Save</Button>
        </div>
      </Card>

      {isAdmin && (
        <Card className="p-5 border-destructive/50">
          <h3 className="font-semibold mb-2 text-destructive">Danger zone</h3>
          <p className="text-sm text-muted-foreground mb-3">Permanently delete this project, all stories, sprints, channels, and chat history.</p>
          <Button variant="destructive" onClick={remove}>Delete project</Button>
        </Card>
      )}
    </div>
  );
}
