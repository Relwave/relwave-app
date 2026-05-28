import { useState, useEffect } from "react";
import { Database, Link as LinkIcon, FolderOpen, Shield, Server, User, Lock, Key, FileKey } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { parseConnectionUrl } from "@/lib/parseConnectionUrl";
import { AddConnectionDialogProps, INITIAL_FORM_DATA, ConnectionFormData } from "../types";

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
}: AddConnectionDialogProps) {
  const [useUrl, setUseUrl] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [formData, setFormData] = useState<ConnectionFormData>(INITIAL_FORM_DATA);

  // Apply initial data when dialog opens with prefilled values
  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData(prev => ({ ...prev, ...INITIAL_FORM_DATA, ...initialData }));
      } else {
        // Reset to empty form when opening without initial data
        setFormData(INITIAL_FORM_DATA);
        setConnectionUrl("");
        setUseUrl(false);
      }
    }
  }, [open, initialData]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleUrlChange = (url: string) => {
    setConnectionUrl(url);
    const parsed = parseConnectionUrl(url);
    if (parsed) {
      setFormData(prev => ({
        ...prev,
        type: parsed.type,
        host: parsed.host,
        port: parsed.port,
        user: parsed.user,
        password: parsed.password,
        database: parsed.database,
        ssl: parsed.ssl,
        sslmode: parsed.sslmode,
      }));
    }
  };

  const handleSubmit = () => {
    onSubmit(formData, useUrl, connectionUrl);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormData(INITIAL_FORM_DATA);
      setConnectionUrl("");
      setUseUrl(false);
    }
    onOpenChange(newOpen);
  };

  const isSQLite = formData.type === "sqlite";
  const showSslOption = formData.type === "postgresql" || formData.type === "mariadb";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-110 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            {initialData ? "Edit Connection" : "New Connection"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Connect to PostgreSQL, MySQL, MariaDB, or SQLite
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isSQLite && (
            <Tabs value={useUrl ? "url" : "params"} onValueChange={(v) => setUseUrl(v === "url")}>
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="params" className="text-xs">Parameters</TabsTrigger>
                <TabsTrigger value="url" className="text-xs">
                  <LinkIcon className="h-3 w-3 mr-1" />
                  URL
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {useUrl && !isSQLite && (
            <div className="space-y-1.5">
              <Label className="text-xs">Connection URL</Label>
              <Input
                placeholder="postgres://user:pass@localhost:5432/db"
                value={connectionUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="font-mono text-xs h-9"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              placeholder="My Database"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={formData.type} onValueChange={(val) => {
              handleInputChange("type", val);
              if (val === "sqlite") {
                // Clear network-related fields when switching to SQLite
                setUseUrl(false);
                setConnectionUrl("");
                setFormData(prev => ({
                  ...prev,
                  type: val,
                  host: "",
                  port: "",
                  user: "",
                  password: "",
                  ssl: false,
                  sslmode: "",
                  // Clear all SSH fields so stale credentials don't pollute the SQLite payload
                  useSsh: false,
                  sshHost: "",
                  sshPort: "22",
                  sshUser: "",
                  sshPassword: "",
                  sshPrivateKeyPath: "",
                  sshPassphrase: "",
                }));
              }
            }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="mariadb">MariaDB</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isSQLite ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Database File</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="/path/to/database.db"
                  value={formData.database}
                  onChange={(e) => handleInputChange("database", e.target.value)}
                  className="h-9 text-sm font-mono flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={async () => {
                    const selected = await openDialog({
                      title: "Select SQLite Database",
                      filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3", "s3db"] }],
                    });
                    if (selected) handleInputChange("database", selected as string);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Host</Label>
                  <Input
                    placeholder="localhost"
                    value={formData.host}
                    onChange={(e) => handleInputChange("host", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input
                    placeholder={formData.type === "mysql" || formData.type === "mariadb" ? "3306" : "5432"}
                    value={formData.port}
                    onChange={(e) => handleInputChange("port", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Username</Label>
                  <Input
                    placeholder={formData.type === "postgresql" ? "postgres" : "root"}
                    value={formData.user}
                    onChange={(e) => handleInputChange("user", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Database</Label>
                <Input
                  placeholder="myapp"
                  value={formData.database}
                  onChange={(e) => handleInputChange("database", e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>

              {showSslOption && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                  <Checkbox
                    id="ssl"
                    checked={formData.ssl}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, ssl: checked as boolean }))
                    }
                  />
                  <Label htmlFor="ssl" className="cursor-pointer text-xs">
                    Enable SSL
                  </Label>
                </div>
              )}

              {/* SSH Tunnel Section */}
              <div className="space-y-4 pt-2 border-t border-border/50 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <Label htmlFor="useSsh" className="text-sm font-medium">SSH Tunnel</Label>
                  </div>
                  <Switch
                    id="useSsh"
                    checked={formData.useSsh}
                    onCheckedChange={(checked) => handleInputChange("useSsh", checked)}
                  />
                </div>

                {formData.useSsh && (
                  <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Server className="h-3 w-3" /> SSH Host
                        </Label>
                        <Input
                          placeholder="ssh.example.com"
                          value={formData.sshHost}
                          onChange={(e) => handleInputChange("sshHost", e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">SSH Port</Label>
                        <Input
                          placeholder="22"
                          value={formData.sshPort}
                          onChange={(e) => handleInputChange("sshPort", e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <User className="h-3 w-3" /> SSH Username
                      </Label>
                      <Input
                        placeholder="ubuntu"
                        value={formData.sshUser}
                        onChange={(e) => handleInputChange("sshUser", e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Auth Method</Label>
                      <Select
                        value={formData.sshAuthMethod}
                        onValueChange={(val: "password" | "privateKey") => handleInputChange("sshAuthMethod", val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="password">Password</SelectItem>
                          <SelectItem value="privateKey">Private Key</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.sshAuthMethod === "password" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Lock className="h-3 w-3" /> SSH Password
                        </Label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          value={formData.sshPassword}
                          onChange={(e) => handleInputChange("sshPassword", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Key className="h-3 w-3" /> Private Key Path
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="/home/user/.ssh/id_rsa"
                              value={formData.sshPrivateKeyPath}
                              onChange={(e) => handleInputChange("sshPrivateKeyPath", e.target.value)}
                              className="h-8 text-xs font-mono flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2"
                              onClick={async () => {
                                const selected = await openDialog({
                                  title: "Select Private Key",
                                });
                                if (selected) handleInputChange("sshPrivateKeyPath", selected as string);
                              }}
                            >
                              <FileKey className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Lock className="h-3 w-3" /> Passphrase (Optional)
                          </Label>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            value={formData.sshPassphrase}
                            onChange={(e) => handleInputChange("sshPassphrase", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} size="sm" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} size="sm" disabled={isLoading}>
            {isLoading ? "Connecting..." : (initialData ? "Save Changes" : "Connect")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
