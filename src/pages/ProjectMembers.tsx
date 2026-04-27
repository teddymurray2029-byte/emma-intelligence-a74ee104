import { useEffect, useState, useCallback } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace, type PMRole } from "@/lib/pm-api";
import { Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function ProjectMembers() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const [members, setMembers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PMRole>("contributor");
  const [lastInvite, setLastInvite] = useState<string | null>(null);

  const isAdmin = workspace.my_role === "admin";

  const load = useCallback(async () => {
    if (!id) return;
    const r = await pmApi.listMembers(id, getToken);
    setMembers(r.data || []);
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!email.trim() || !id) return;
    try {
      const r = await pmApi.invite({ workspace_id: id, email: email.trim(), role }, getToken);
      const link = `${window.location.origin}${r.invite_link}`;
      setLastInvite(link);
      setEmail("");
      toast.success("Invite created — share the link");
    } catch (e: any) { toast.error(e.message); }
  };

  const updateRole = async (member_id: string, newRole: PMRole) => {
    try {
      await pmApi.updateRole({ workspace_id: id, member_id, role: newRole }, getToken);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (member_id: string) => {
    if (!confirm("Remove this member?")) return;
    try {
      await pmApi.removeMember({ workspace_id: id, member_id }, getToken);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 && "s"}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Invite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite team member</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Select value={role} onValueChange={(v: any) => setRole(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer (can view, comment, create stories)</SelectItem>
                    <SelectItem value="contributor">Contributor (can edit + run AI)</SelectItem>
                    <SelectItem value="mod">Mod (can manage sprints + epics)</SelectItem>
                    <SelectItem value="admin">Admin (full control)</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={invite} className="w-full" disabled={!email.trim()}>Generate invite</Button>
                {lastInvite && (
                  <div className="border border-border rounded-md p-3 bg-card/30">
                    <div className="text-xs text-muted-foreground mb-1">Invite link (valid 14 days)</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs flex-1 truncate">{lastInvite}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(lastInvite); toast.success("Copied"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {isAdmin && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.display_name || m.user_id?.slice(0, 14) || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{m.email || "—"}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Select value={m.role} onValueChange={(v: any) => updateRole(m.id, v)}>
                      <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="contributor">Contributor</SelectItem>
                        <SelectItem value="mod">Mod</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : <Badge variant="outline" className="capitalize">{m.role}</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(m.joined_at).toLocaleDateString()}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(m.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <strong>Roles:</strong> viewers can browse and add stories; contributors can edit and trigger AI runs; mods manage sprints/epics; admins manage members and settings.
      </div>
    </div>
  );
}
