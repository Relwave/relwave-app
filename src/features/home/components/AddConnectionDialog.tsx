import { useState, useEffect } from "react";
import {
  Database,
  Link as LinkIcon,
  FolderOpen,
  Shield,
  Server,
  User,
  Lock,
  Key,
  FileKey,
  Settings,
  ArrowLeft,
} from "lucide-react";
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
import {
  parseConnectionUrl,
  cleanClickHouseUrl,
  parseClickHouseUrl,
} from "@/lib/parseConnectionUrl";
import { databases, getDatabaseMeta, DatabaseConfig } from "@/lib/databases";
import { AddConnectionDialogProps, INITIAL_FORM_DATA, ConnectionFormData } from "../types";

type DialogStep = "select" | "configure";

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
  isDiscoveredMode,
}: AddConnectionDialogProps) {
  const [step, setStep] = useState<DialogStep>("select");
  const [useUrl, setUseUrl] = useState(true);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [formData, setFormData] = useState<ConnectionFormData>(INITIAL_FORM_DATA);

  // Apply initial data when dialog opens with prefilled values
  useEffect(() => {
    if (open) {
      if (initialData && initialData.type) {
        const reconstructedUrl =
          initialData.url ||
          (initialData.type === "clickhouse" && initialData.host
            ? `${initialData.ssl ? "https" : "http"}://${initialData.host}:${
                initialData.port || (initialData.ssl ? "8443" : "8123")
              }`
            : "");

        setFormData((prev) => ({
          ...prev,
          ...INITIAL_FORM_DATA,
          ...initialData,
          url: reconstructedUrl || initialData.url || "",
        }));

        if (
          isDiscoveredMode ||
          initialData.type === "clickhouse" ||
          initialData.type === "sqlite" ||
          initialData.type === "duckdb"
        ) {
          setUseUrl(false);
        }
        setStep("configure");
      } else {
        // Reset to initial state when opening fresh
        setFormData(INITIAL_FORM_DATA);
        setConnectionUrl("");
        setUseUrl(true);
        setStep("select");
      }
    }
  }, [open, initialData, isDiscoveredMode]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectDatabase = (db: DatabaseConfig) => {
    const isFileBased = db.isFileBased || db.type === "sqlite" || db.type === "duckdb";
    const isCh = db.type === "clickhouse";

    setFormData((prev) => ({
      ...prev,
      type: db.type,
      name: prev.name || `${db.name} Local`,
      host: isFileBased ? "" : prev.host || (isCh ? "localhost" : "localhost"),
      port: isFileBased ? "" : prev.port || db.defaultPort || "",
      user: isFileBased ? "" : prev.user || db.defaultUser || "",
      password: isFileBased ? "" : prev.password || "",
      database: isFileBased ? "" : prev.database || db.defaultDatabase || "",
      ssl: isCh ? false : prev.ssl,
      sslmode: "",
      url: isCh && !prev.url ? `http://localhost:${db.defaultPort || "8123"}` : prev.url,
      useSsh: false,
    }));

    if (isFileBased || isCh) {
      setUseUrl(false);
    } else {
      setUseUrl(true);
    }

    setStep("configure");
  };

  const handleUrlChange = (url: string) => {
    setConnectionUrl(url);
    const parsed = parseConnectionUrl(url);
    if (parsed) {
      if (parsed.type === "clickhouse") {
        setUseUrl(false);
        setFormData((prev) => ({
          ...prev,
          type: "clickhouse",
          url: cleanClickHouseUrl(url),
          host: parsed.host,
          port: parsed.port,
          user: parsed.user || "default",
          password: parsed.password || prev.password,
          database: parsed.database || "default",
          ssl: parsed.ssl,
          sslmode: parsed.sslmode,
        }));
        return;
      }
      setFormData((prev) => ({
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
    if (formData.type === "clickhouse") {
      const parsed = parseClickHouseUrl(formData.url);
      const cleanedUrl = cleanClickHouseUrl(formData.url);
      onSubmit(
        {
          ...formData,
          url: cleanedUrl,
          host: parsed.host || formData.host || "localhost",
          port: parsed.port || formData.port || (parsed.ssl ? "8443" : "8123"),
          ssl: parsed.ssl ?? formData.ssl,
          sslmode: (parsed.ssl ?? formData.ssl) ? "require" : "disable",
          user: formData.user || parsed.user || "default",
          password: formData.password || parsed.password || "",
          database: formData.database || parsed.database || "default",
        },
        false,
        cleanedUrl,
      );
      return;
    }
    onSubmit(formData, useUrl, connectionUrl);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFormData(INITIAL_FORM_DATA);
      setConnectionUrl("");
      setUseUrl(true);
      setStep("select");
    }
    onOpenChange(newOpen);
  };

  const isFileBasedDB = formData.type === "sqlite" || formData.type === "duckdb";
  const isClickHouse = formData.type === "clickhouse";
  const showSslOption = formData.type === "postgresql" || formData.type === "mariadb";
  const selectedDbMeta = getDatabaseMeta(formData.type);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto"
        onKeyDown={(e) => {
          if (e.key === "Enter" && step === "configure") {
            const target = e.target as HTMLElement;
            if (target.tagName !== "BUTTON" && target.tagName !== "A") {
              e.preventDefault();
              if (!isLoading) handleSubmit();
            }
          }
        }}
      >
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Database className="h-4 w-4 text-muted-foreground" />
                Select Database
              </DialogTitle>
              <DialogDescription className="text-xs">
                Choose a database engine to configure your connection.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
              {databases.map((db) => (
                <button
                  key={db.id}
                  type="button"
                  onClick={() => handleSelectDatabase(db)}
                  className="group relative flex flex-col items-center justify-between p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/40 hover:border-primary/50 transition-all duration-150 text-center hover:shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="w-full flex justify-end">
                    <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground">
                      {db.category}
                    </span>
                  </div>

                  <div className="w-12 h-12 my-2 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 [&>svg]:w-full [&>svg]:h-full [&>svg]:drop-shadow-xs">
                    {db.icon}
                  </div>

                  <div className="w-full">
                    <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {db.name}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {db.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-1.5">
              {!isDiscoveredMode && !initialData && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("select")}
                    className="h-7 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>All Databases</span>
                  </Button>
                </div>
              )}

              <DialogTitle className="flex items-center gap-2.5 text-base">
                <div className="w-5 h-5 shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
                  {selectedDbMeta?.icon || <Database className="h-4 w-4 text-muted-foreground" />}
                </div>
                <span>
                  {initialData
                    ? `Edit ${selectedDbMeta?.name || "Connection"}`
                    : `Connect to ${selectedDbMeta?.name || "Database"}`}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedDbMeta?.description || "Enter connection credentials and details."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Tabs for URL vs Parameters (PostgreSQL, MySQL, MariaDB, ClickHouse) */}
              {!isFileBasedDB && !isDiscoveredMode && (
                <Tabs
                  value={useUrl ? "url" : "params"}
                  onValueChange={(v) => {
                    const isUrlMode = v === "url";
                    setUseUrl(isUrlMode);
                    if (isClickHouse && !isUrlMode && !formData.url) {
                      setFormData((prev) => ({
                        ...prev,
                        url: `${prev.ssl ? "https" : "http"}://${prev.host || "localhost"}:${
                          prev.port || (prev.ssl ? "8443" : "8123")
                        }`,
                      }));
                    }
                  }}
                >
                  <TabsList className="grid w-full grid-cols-2 h-9">
                    <TabsTrigger value="url" className="text-xs">
                      <LinkIcon className="h-3 w-3 mr-1" />
                      URL
                    </TabsTrigger>
                    <TabsTrigger value="params" className="text-xs">
                      <Settings className="h-3 w-3 mr-1" />
                      Parameters
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              {/* Connection URL Mode */}
              {useUrl && !isFileBasedDB && !isClickHouse && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Connection URL</Label>
                  <Input
                    placeholder={
                      selectedDbMeta?.placeholderUrl || "postgres://user:pass@localhost:5432/db"
                    }
                    value={connectionUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="font-mono text-xs h-9"
                  />
                </div>
              )}

              {/* Common Connection Name */}
              <div className="space-y-1.5">
                <Label className="text-xs">Connection Name</Label>
                <Input
                  placeholder={`My ${selectedDbMeta?.name || "Database"}`}
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* File-based DB (SQLite or DuckDB) */}
              {isFileBasedDB ? (
                <div className="space-y-2">
                  <Label className="text-xs">Database File Path</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={
                        formData.type === "duckdb"
                          ? "/path/to/analytics.duckdb"
                          : "/path/to/database.db"
                      }
                      value={formData.database}
                      onChange={(e) => handleInputChange("database", e.target.value)}
                      readOnly={isDiscoveredMode}
                      className={`h-9 text-sm font-mono flex-1 ${
                        isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                      }`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-3"
                      disabled={isDiscoveredMode}
                      onClick={async () => {
                        const selected = await openDialog({
                          title: `Select ${selectedDbMeta?.name || "Database"} File`,
                          filters: [
                            {
                              name: selectedDbMeta?.name || "Database",
                              extensions: selectedDbMeta?.fileExtensions || [
                                "db",
                                "sqlite",
                                "duckdb",
                              ],
                            },
                          ],
                        });
                        if (selected) handleInputChange("database", selected as string);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formData.type === "duckdb"
                      ? "Select a local DuckDB file (.duckdb, .db, .ddb). Direct fast in-process analytical execution."
                      : "Select a local SQLite file (.db, .sqlite, .sqlite3). Direct zero-configuration database."}
                  </p>
                </div>
              ) : isClickHouse ? (
                /* ClickHouse Specific Form */
                <>
                  {useUrl ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Instance URL</Label>
                      <Input
                        placeholder="http://localhost:8123 or https://your-cluster.clickhouse.cloud:8443"
                        value={formData.url || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleInputChange("url", val);
                          const parsed = parseClickHouseUrl(val);
                          setFormData((prev) => ({
                            ...prev,
                            url: val,
                            host: parsed.host || prev.host,
                            port: parsed.port || prev.port,
                            ssl: parsed.ssl,
                            user: prev.user || parsed.user || "default",
                            database: prev.database || parsed.database || "default",
                          }));
                        }}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm font-mono ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Host</Label>
                        <Input
                          placeholder="localhost"
                          value={formData.host}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleInputChange("host", val);
                            setFormData((prev) => ({
                              ...prev,
                              host: val,
                              url: `${prev.ssl ? "https" : "http"}://${val || "localhost"}:${
                                prev.port || (prev.ssl ? "8443" : "8123")
                              }`,
                            }));
                          }}
                          readOnly={isDiscoveredMode}
                          className={`h-9 text-sm font-mono ${
                            isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                          }`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Port</Label>
                        <Input
                          placeholder="8123"
                          value={formData.port}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleInputChange("port", val);
                            setFormData((prev) => ({
                              ...prev,
                              port: val,
                              url: `${prev.ssl ? "https" : "http"}://${prev.host || "localhost"}:${
                                val || (prev.ssl ? "8443" : "8123")
                              }`,
                            }));
                          }}
                          readOnly={isDiscoveredMode}
                          className={`h-9 text-sm font-mono ${
                            isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Username</Label>
                      <Input
                        placeholder="default"
                        value={formData.user}
                        onChange={(e) => handleInputChange("user", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm font-mono ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Database</Label>
                    <Input
                      placeholder="default"
                      value={formData.database}
                      onChange={(e) => handleInputChange("database", e.target.value)}
                      readOnly={isDiscoveredMode}
                      className={`h-9 text-sm font-mono ${
                        isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                      }`}
                    />
                  </div>

                  {!isDiscoveredMode && !useUrl && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                      <Checkbox
                        id="clickhouse-ssl"
                        checked={formData.ssl}
                        onCheckedChange={(checked) => {
                          const isSsl = Boolean(checked);
                          setFormData((prev) => ({
                            ...prev,
                            ssl: isSsl,
                            port: isSsl
                              ? prev.port === "8123"
                                ? "8443"
                                : prev.port
                              : prev.port === "8443"
                                ? "8123"
                                : prev.port,
                            url: `${isSsl ? "https" : "http"}://${prev.host || "localhost"}:${
                              isSsl ? (prev.port === "8123" ? "8443" : prev.port) : prev.port
                            }`,
                          }));
                        }}
                      />
                      <Label htmlFor="clickhouse-ssl" className="cursor-pointer text-xs">
                        Enable SSL / TLS (HTTPS port 8443)
                      </Label>
                    </div>
                  )}
                </>
              ) : !useUrl ? (
                /* Parameters Mode for PostgreSQL, MySQL, MariaDB */
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Host</Label>
                      <Input
                        placeholder="localhost"
                        value={formData.host}
                        onChange={(e) => handleInputChange("host", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm font-mono ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input
                        placeholder={selectedDbMeta?.defaultPort || "5432"}
                        value={formData.port}
                        onChange={(e) => handleInputChange("port", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm font-mono ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Username</Label>
                      <Input
                        placeholder={selectedDbMeta?.defaultUser || "postgres"}
                        value={formData.user}
                        onChange={(e) => handleInputChange("user", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm font-mono ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        readOnly={isDiscoveredMode}
                        className={`h-9 text-sm ${
                          isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Database</Label>
                    <Input
                      placeholder={selectedDbMeta?.defaultDatabase || "myapp"}
                      value={formData.database}
                      onChange={(e) => handleInputChange("database", e.target.value)}
                      readOnly={isDiscoveredMode}
                      className={`h-9 text-sm font-mono ${
                        isDiscoveredMode ? "opacity-60 bg-muted cursor-not-allowed" : ""
                      }`}
                    />
                  </div>

                  {showSslOption && !isDiscoveredMode && (
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
                  {!isDiscoveredMode && selectedDbMeta?.supportsSsh && (
                    <div className="space-y-4 pt-2 border-t border-border/50 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-blue-500" />
                          <Label htmlFor="useSsh" className="text-sm font-medium">
                            SSH Tunnel
                          </Label>
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
                              onValueChange={(val: "password" | "privateKey") =>
                                handleInputChange("sshAuthMethod", val)
                              }
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
                                    onChange={(e) =>
                                      handleInputChange("sshPrivateKeyPath", e.target.value)
                                    }
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
                                      if (selected)
                                        handleInputChange("sshPrivateKeyPath", selected as string);
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
                                  onChange={(e) =>
                                    handleInputChange("sshPassphrase", e.target.value)
                                  }
                                  className="h-8 text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border/40">
              <div>
                {!isDiscoveredMode && !initialData && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("select")}
                    disabled={isLoading}
                    className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  size="sm"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} size="sm" disabled={isLoading}>
                  {isLoading ? "Connecting..." : initialData ? "Save Changes" : "Connect"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
