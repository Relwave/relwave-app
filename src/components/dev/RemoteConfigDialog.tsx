import { useState } from "react";
import { Globe, Plus, Trash2, Pencil, Check, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  useGitRemotes,
  useGitRemoteAdd,
  useGitRemoteRemove,
  useGitRemoteSetUrl,
} from "@/features/git/hooks/useGitAdvanced";
import { toast } from "sonner";
import type { GitRemoteInfo } from "@/features/git/types";

interface RemoteConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDir: string | null | undefined;
}

export default function RemoteConfigDialog({
  open,
  onOpenChange,
  projectDir,
}: RemoteConfigDialogProps) {
  const { data: remotes, isLoading } = useGitRemotes(open ? projectDir : undefined);
  const addMutation = useGitRemoteAdd(projectDir);
  const removeMutation = useGitRemoteRemove(projectDir);
  const setUrlMutation = useGitRemoteSetUrl(projectDir);

  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("origin");
  const [newUrl, setNewUrl] = useState("");

  // Editing state
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      await addMutation.mutateAsync({ name: newName.trim(), url: newUrl.trim() });
      toast.success(`Remote '${newName.trim()}' added`);
      setNewName("origin");
      setNewUrl("");
      setAddMode(false);
    } catch (e: any) {
      toast.error("Failed to add remote: " + e.message);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await removeMutation.mutateAsync(name);
      toast.success(`Remote '${name}' removed`);
    } catch (e: any) {
      toast.error("Failed to remove remote: " + e.message);
    }
  };

  const handleUpdateUrl = async (name: string) => {
    if (!editUrl.trim()) return;
    try {
      await setUrlMutation.mutateAsync({ name, url: editUrl.trim() });
      toast.success(`Remote '${name}' URL updated`);
      setEditingRemote(null);
      setEditUrl("");
    } catch (e: any) {
      toast.error("Failed to update URL: " + e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Remote Repositories
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-90 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-5 w-5" />
            </div>
          )}

          {!isLoading && (!remotes || remotes.length === 0) && !addMode && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No remotes configured.</p>
              <p className="text-xs mt-1">Add a remote to push and pull changes.</p>
            </div>
          )}

          {remotes?.map((r: GitRemoteInfo) => (
            <div key={r.name} className="border rounded-md p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium">{r.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      navigator.clipboard.writeText(r.pushUrl || r.fetchUrl);
                      toast.success("URL copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setEditingRemote(r.name);
                      setEditUrl(r.pushUrl || r.fetchUrl);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(r.name)}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {editingRemote === r.name ? (
                <div className="flex gap-2">
                  <Input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className="h-7 text-xs font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateUrl(r.name);
                      if (e.key === "Escape") setEditingRemote(null);
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleUpdateUrl(r.name)}
                    disabled={setUrlMutation.isPending}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setEditingRemote(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {r.pushUrl || r.fetchUrl}
                </p>
              )}
            </div>
          ))}

          {/* Add new remote form */}
          {addMode && (
            <div className="border rounded-md p-3 space-y-2 border-dashed">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Remote name (e.g. origin)"
                className="h-7 text-xs font-mono"
                autoFocus
              />
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                className="h-7 text-xs font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setAddMode(false);
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAddMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newUrl.trim() || addMutation.isPending}
                >
                  {addMutation.isPending ? (
                    <Spinner className="h-3 w-3 mr-1" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!addMode && (
            <Button variant="outline" size="sm" onClick={() => setAddMode(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Remote
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
