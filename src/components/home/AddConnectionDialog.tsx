import { useState } from "react";
import { Database, Link as LinkIcon } from "lucide-react";
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
import { parseConnectionUrl } from "@/lib/parseConnectionUrl";
import { AddConnectionDialogProps, INITIAL_FORM_DATA, ConnectionFormData } from "./types";

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AddConnectionDialogProps) {
  const [useUrl, setUseUrl] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [formData, setFormData] = useState<ConnectionFormData>(INITIAL_FORM_DATA);

  const handleInputChange = (field: string, value: string) => {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            New Connection
          </DialogTitle>
          <DialogDescription className="text-xs">
            Connect to PostgreSQL or MySQL
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Tabs value={useUrl ? "url" : "params"} onValueChange={(v) => setUseUrl(v === "url")}>
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="params" className="text-xs">Parameters</TabsTrigger>
              <TabsTrigger value="url" className="text-xs">
                <LinkIcon className="h-3 w-3 mr-1" />
                URL
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {useUrl && (
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
            <Select value={formData.type} onValueChange={(val) => handleInputChange("type", val)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                placeholder="5432"
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
                placeholder="postgres"
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

          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
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
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} size="sm" disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} size="sm" disabled={isLoading}>
            {isLoading ? "Connecting..." : "Connect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
