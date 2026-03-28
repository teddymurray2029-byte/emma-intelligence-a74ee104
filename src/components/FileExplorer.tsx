import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, Edit2, FileCode, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface ProjectFile {
  path: string;
  content: string;
}

interface FileExplorerProps {
  files: ProjectFile[];
  onFileSelect: (path: string) => void;
  onFilesChange: (files: ProjectFile[]) => void;
  selectedFile?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      pathSoFar += (i > 0 ? "/" : "") + parts[i];
      const isLast = i === parts.length - 1;
      let existing = current.find((n) => n.name === parts[i] && n.isDir === !isLast);
      if (!existing) {
        existing = { name: parts[i], path: pathSoFar, isDir: !isLast, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  }
  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => ({ ...n, children: sortTree(n.children) }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-blue-400" />;
  if (["css", "scss"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-pink-400" />;
  if (["json", "yaml", "yml"].includes(ext || "")) return <FileCode className="h-3.5 w-3.5 text-yellow-400" />;
  if (["md", "txt"].includes(ext || "")) return <File className="h-3.5 w-3.5 text-muted-foreground" />;
  return <File className="h-3.5 w-3.5 text-muted-foreground" />;
}

function TreeItem({ node, depth, selectedFile, expanded, onToggle, onSelect, onDelete, onRename }: {
  node: TreeNode; depth: number; selectedFile?: string; expanded: Set<string>;
  onToggle: (path: string) => void; onSelect: (path: string) => void;
  onDelete: (path: string, isDir: boolean) => void; onRename: (oldPath: string, newName: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isSelected = node.path === selectedFile;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);

  const handleRename = () => {
    if (renameName.trim() && renameName !== node.name) {
      onRename(node.path, renameName.trim());
    }
    setIsRenaming(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-xs hover:bg-secondary/50 transition-colors group ${isSelected ? "bg-primary/10 text-primary" : "text-foreground"}`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={(e) => {
              e.preventDefault();
              if (node.isDir) onToggle(node.path);
              else onSelect(node.path);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {node.isDir ? (
              <>
                {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-primary" /> : <Folder className="h-3.5 w-3.5 text-primary" />}
              </>
            ) : (
              <>
                <span className="w-3" />
                {getFileIcon(node.name)}
              </>
            )}
            {isRenaming ? (
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setIsRenaming(false); }}
                className="h-5 text-xs px-1 py-0 w-32"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate flex-1">{node.name}</span>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-36">
          <DropdownMenuItem onClick={() => { setRenameName(node.name); setIsRenaming(true); }}>
            <Edit2 className="h-3 w-3 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(node.path, node.isDir)} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {node.isDir && isOpen && node.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onDelete={onDelete} onRename={onRename} />
      ))}
    </>
  );
}

export function FileExplorer({ files, onFileSelect, onFilesChange, selectedFile }: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  const tree = buildTree(files);

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const path = newFileName.trim();
    if (files.some((f) => f.path === path)) return;
    onFilesChange([...files, { path, content: "" }]);
    setNewFileName("");
    setShowNewFile(false);
    onFileSelect(path);
  };

  const handleDelete = (path: string, isDir: boolean) => {
    if (isDir) {
      onFilesChange(files.filter((f) => !f.path.startsWith(path + "/")));
    } else {
      onFilesChange(files.filter((f) => f.path !== path));
    }
  };

  const handleRename = (oldPath: string, newName: string) => {
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    onFilesChange(files.map((f) => {
      if (f.path === oldPath) return { ...f, path: newPath };
      if (f.path.startsWith(oldPath + "/")) return { ...f, path: f.path.replace(oldPath, newPath) };
      return f;
    }));
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Explorer</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewFile(true)}>
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {showNewFile && (
        <div className="px-2 py-1 border-b border-border flex gap-1">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFile(); if (e.key === "Escape") setShowNewFile(false); }}
            placeholder="path/to/file.ts"
            className="h-6 text-xs"
            autoFocus
          />
          <Button size="icon" className="h-6 w-6" onClick={handleCreateFile}><Plus className="h-3 w-3" /></Button>
        </div>
      )}
      <ScrollArea className="flex-1">
        {tree.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No files yet. Create one above.</div>
        ) : (
          tree.map((node) => (
            <TreeItem key={node.path} node={node} depth={0} selectedFile={selectedFile} expanded={expanded} onToggle={onToggle} onSelect={onFileSelect} onDelete={handleDelete} onRename={handleRename} />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
