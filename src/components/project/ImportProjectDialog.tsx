import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Database, Check, AlertCircle, Loader2, FileSearch } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { bridgeApi } from "@/services/bridgeApi";
import type { ScanImportResult } from "@/types/project";

// ==========================================
// Types
// ==========================================

interface ImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful import with the new project id and name */
  onComplete: (projectId: string, projectName: string) => void;
}

type Step = "pick-folder" | "scanning" | "preview" | "importing" | "success";

interface DbFormData {
  name: string;
  type: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

const INITIAL_DB_FORM: DbFormData = {
  name: "",
  type: "",
  host: "",
  port: "",
  user: "",
  password: "",
  database: "",
  ssl: false,
};

// ==========================================
// Component
// ==========================================

export function ImportProjectDialog({
  open: isOpen,
  onOpenChange,
  onComplete,
}: ImportProjectDialogProps) {
  const [step, setStep] = useState<Step>("pick-folder");
  const [selectedPath, setSelectedPath] = useState("");
  const [scanResult, setScanResult] = useState<ScanImportResult | null>(null);
  const [dbForm, setDbForm] = useState<DbFormData>(INITIAL_DB_FORM);
  const [error, setError] = useState<string | null>(null);
  const [importedName, setImportedName] = useState("");

  const reset = () => {
    setStep("pick-folder");
    setSelectedPath("");
    setScanResult(null);
    setDbForm(INITIAL_DB_FORM);
    setError(null);
    setImportedName("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) reset();
    onOpenChange(newOpen);
  };

  // ---- Step 1: Pick folder ----
  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select cloned RelWave project folder",
      });
      if (selected) {
        setSelectedPath(selected as string);
      }
    } catch {
      // User cancelled
    }
  };

  // ---- Step 2: Scan source (read-only preview) ----
  const handleScan = async () => {
    if (!selectedPath) return;
    setError(null);
    setStep("scanning");

    try {
      const result = await bridgeApi.scanImportSource(selectedPath);
      setScanResult(result);

      // Pre-fill DB form from scan results
      const meta = result.metadata;
      const env = result.parsedEnv;

      setDbForm({
        name: env?.name || `${meta.name} (imported)`,
        type: env?.type || meta.engine || "",
        host: env?.host || "",
        port: env?.port?.toString() || "",
        user: env?.user || "",
        password: env?.password || "",
        database: env?.database || "",
        ssl: env?.ssl ?? false,
      });

      setStep("preview");
    } catch (err: any) {
      setError(err.message || "Failed to scan folder");
      setStep("pick-folder");
    }
  };

  // ---- Step 3: Create DB connection → Import project ----
  const handleImport = async () => {
    if (!selectedPath || !scanResult) return;
    setError(null);
    setStep("importing");

    let createdDbId: string | null = null;

    try {
      // 1. Create the database connection first
      const db = await bridgeApi.addDatabase({
        name: dbForm.name,
        type: dbForm.type,
        host: dbForm.host,
        port: parseInt(dbForm.port, 10),
        user: dbForm.user,
        password: dbForm.password,
        database: dbForm.database,
        ssl: dbForm.ssl,
      });
      createdDbId = db.id;

      // 2. Import the project with a valid databaseId
      const project = await bridgeApi.importProject({
        sourcePath: selectedPath,
        databaseId: db.id,
      });

      setImportedName(project.name);
      setStep("success");

      // Notify parent so it can invalidate caches + select the project
      onComplete(project.id, project.name);
    } catch (err: any) {
      // Roll back the database connection if it was created but import failed
      if (createdDbId) {
        try {
          await bridgeApi.deleteDatabase(createdDbId);
        } catch {
          // Best-effort cleanup — don't mask the original error
        }
      }
      setError(err.message || "Import failed");
      setStep("preview"); // Go back so user can retry
    }
  };

  const handleDbInputChange = (field: keyof DbFormData, value: string | boolean) => {
    setDbForm((prev) => ({ ...prev, [field]: value }));
  };

  const isDbFormValid =
    dbForm.name && dbForm.type && dbForm.host && dbForm.port && dbForm.user && dbForm.database;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Import Project
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "pick-folder" && "Select a cloned RelWave project folder to import"}
            {step === "scanning" && "Scanning project folder..."}
            {step === "preview" && "Review project details and provide database connection"}
            {step === "importing" && "Creating connection and importing..."}
            {step === "success" && "Project imported successfully"}
          </DialogDescription>
        </DialogHeader>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ---- Pick Folder Step ---- */}
        {step === "pick-folder" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Project Folder</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Select a folder..."
                  value={selectedPath}
                  readOnly
                  className="h-9 text-xs font-mono flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePickFolder}
                  className="shrink-0"
                >
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Browse
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                The folder should contain a <code className="text-[10px]">relwave.json</code> file.
                If a <code className="text-[10px]">.env</code> file is present, database connection
                details will be extracted automatically.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleScan} disabled={!selectedPath}>
                <FileSearch className="h-3.5 w-3.5 mr-1.5" />
                Scan
              </Button>
            </div>
          </div>
        )}

        {/* ---- Scanning Step ---- */}
        {step === "scanning" && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Scanning project folder...</p>
          </div>
        )}

        {/* ---- Preview + Connection Form ---- */}
        {step === "preview" && scanResult && (
          <div className="space-y-4 py-2">
            {/* Project info */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
              <p><strong>Project:</strong> {scanResult.metadata.name}</p>
              {scanResult.metadata.description && (
                <p className="text-muted-foreground">{scanResult.metadata.description}</p>
              )}
              {scanResult.metadata.engine && (
                <p><strong>Engine:</strong> {scanResult.metadata.engine}</p>
              )}
            </div>

            {/* Env status */}
            {scanResult.envFound ? (
              <div className="p-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-xs flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>.env file found — connection details pre-filled below.</span>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                <Database className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  No .env file found. Provide database connection details for{" "}
                  <strong>{scanResult.metadata.name}</strong>.
                </span>
              </div>
            )}

            {/* Connection Form */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Connection Name</Label>
                <Input
                  placeholder="My Database"
                  value={dbForm.name}
                  onChange={(e) => handleDbInputChange("name", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={dbForm.type}
                  onValueChange={(val) => handleDbInputChange("type", val)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mariadb">MariaDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Host</Label>
                  <Input
                    placeholder="localhost"
                    value={dbForm.host}
                    onChange={(e) => handleDbInputChange("host", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input
                    placeholder="5432"
                    value={dbForm.port}
                    onChange={(e) => handleDbInputChange("port", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Username</Label>
                  <Input
                    placeholder="postgres"
                    value={dbForm.user}
                    onChange={(e) => handleDbInputChange("user", e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={dbForm.password}
                    onChange={(e) => handleDbInputChange("password", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Database</Label>
                <Input
                  placeholder="myapp"
                  value={dbForm.database}
                  onChange={(e) => handleDbInputChange("database", e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="import-ssl"
                  checked={dbForm.ssl}
                  onCheckedChange={(checked) => handleDbInputChange("ssl", checked as boolean)}
                />
                <Label htmlFor="import-ssl" className="cursor-pointer text-xs">
                  Enable SSL
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStep("pick-folder"); setError(null); }}
              >
                Back
              </Button>
              <Button size="sm" onClick={handleImport} disabled={!isDbFormValid}>
                Connect & Import
              </Button>
            </div>
          </div>
        )}

        {/* ---- Importing Step ---- */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Creating connection and importing project...</p>
          </div>
        )}

        {/* ---- Success Step ---- */}
        {step === "success" && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center py-4">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium">{importedName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Project imported and database connected
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
