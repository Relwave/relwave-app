import { useState, useEffect } from "react";
import { Bot, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AIProviderName,
  type AISettings as AISettingsData,
  loadAISettings,
  saveAISettings,
  aiService,
} from "@/services/bridge/ai";

// ── Provider metadata ─────────────────────────────────────────────────────

interface ProviderMeta {
  name: AIProviderName;
  label: string;
  description: string;
  requiresKey: boolean;
  keyField?: keyof AISettingsData;
  keyPlaceholder?: string;
  extraFields?: Array<{
    field: keyof AISettingsData;
    label: string;
    placeholder: string;
    type?: string;
  }>;
}

const PROVIDERS: ProviderMeta[] = [
  {
    name: "anthropic",
    label: "Claude (Anthropic)",
    description: "claude-3-5-haiku-20241022",
    requiresKey: true,
    keyField: "anthropicApiKey",
    keyPlaceholder: "sk-ant-api03-…",
  },
  {
    name: "openai",
    label: "OpenAI",
    description: "gpt-4o-mini",
    requiresKey: true,
    keyField: "openaiApiKey",
    keyPlaceholder: "sk-proj-…",
  },
  {
    name: "gemini",
    label: "Gemini (Google)",
    description: "gemini-1.5-flash",
    requiresKey: true,
    keyField: "geminiApiKey",
    keyPlaceholder: "AIzaSy…",
  },
  {
    name: "groq",
    label: "Groq",
    description: "llama-3.3-70b-versatile",
    requiresKey: true,
    keyField: "groqApiKey",
    keyPlaceholder: "gsk_…",
  },
  {
    name: "mistral",
    label: "Mistral",
    description: "mistral-small-latest",
    requiresKey: true,
    keyField: "mistralApiKey",
    keyPlaceholder: "…",
  },
  {
    name: "ollama",
    label: "Ollama (Local)",
    description: "Runs entirely on your machine",
    requiresKey: false,
    extraFields: [
      {
        field: "ollamaBaseUrl",
        label: "Base URL",
        placeholder: "http://localhost:11434",
      },
      {
        field: "ollamaModel",
        label: "Model",
        placeholder: "llama3.2",
      },
    ],
  },
];

// ── Connection status indicator ───────────────────────────────────────────

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

function StatusBadge({ status, message }: { status: ConnectionStatus; message?: string }) {
  if (status === "idle") return null;
  return (
    <div className={cn(
      "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full",
      status === "testing" && "text-muted-foreground bg-muted/50",
      status === "ok" && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      status === "error" && "text-destructive bg-destructive/10",
    )}>
      {status === "testing" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {status === "error" && <XCircle className="h-3 w-3" />}
      {status === "testing" ? "Testing…" : status === "ok" ? "Connected" : (message ?? "Failed")}
    </div>
  );
}

// ── Password field with show/hide ─────────────────────────────────────────

function SecretInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9 h-8 text-xs font-mono border-border/40"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function AISettings() {
  const [settings, setSettings] = useState<AISettingsData>(loadAISettings);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  // Load from storage on mount
  useEffect(() => {
    setSettings(loadAISettings());
  }, []);

  const activeProvider = PROVIDERS.find((p) => p.name === settings.defaultProvider) ?? PROVIDERS[0];

  const update = (patch: Partial<AISettingsData>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setStatus("idle");
  };

  const handleSave = () => {
    saveAISettings(settings);
    setDirty(false);
    setStatus("idle");
  };

  const handleTest = async () => {
    // Save first so the bridge gets the latest values
    saveAISettings(settings);
    setDirty(false);
    setStatus("testing");
    setStatusMessage(undefined);
    const result = await aiService.testConnection(settings);
    if (result.connected) {
      setStatus("ok");
    } else {
      setStatus("error");
      setStatusMessage(result.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">AI Settings</h3>
          <p className="text-[11px] text-muted-foreground/70 leading-none mt-0.5">
            Configure your AI provider. Keys stay on your machine.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30">
        {/* Provider selector */}
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Active Provider</Label>
            <p className="text-[11px] text-muted-foreground/60">{activeProvider.description}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-2 border-border/40 min-w-[160px] justify-between">
                {activeProvider.label}
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {PROVIDERS.map((p) => (
                <DropdownMenuItem
                  key={p.name}
                  className={cn(
                    "flex flex-col items-start text-xs gap-0",
                    p.name === settings.defaultProvider && "bg-primary/8 text-primary font-medium"
                  )}
                  onClick={() => update({ defaultProvider: p.name })}
                >
                  <span>{p.label}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">{p.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Credential fields for the active provider */}
        <div className="p-4 space-y-3">
          {activeProvider.requiresKey && activeProvider.keyField && (
            <div className="space-y-1.5">
              <Label htmlFor={`ai-key-${activeProvider.name}`} className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                API Key
              </Label>
              <SecretInput
                id={`ai-key-${activeProvider.name}`}
                value={(settings[activeProvider.keyField] as string) ?? ""}
                onChange={(v) => update({ [activeProvider.keyField!]: v })}
                placeholder={activeProvider.keyPlaceholder}
              />
            </div>
          )}

          {activeProvider.extraFields?.map((field) => (
            <div key={field.field} className="space-y-1.5">
              <Label htmlFor={`ai-${field.field}`} className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                {field.label}
              </Label>
              <Input
                id={`ai-${field.field}`}
                type={field.type ?? "text"}
                value={(settings[field.field] as string) ?? ""}
                onChange={(e) => update({ [field.field]: e.target.value })}
                placeholder={field.placeholder}
                className="h-8 text-xs border-border/40"
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <StatusBadge status={status} message={statusMessage} />
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border/40"
              onClick={handleTest}
              disabled={status === "testing"}
            >
              {status === "testing" ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : null}
              Test Connection
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={!dirty}
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* All providers key summary (collapsed) */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors select-none list-none flex items-center gap-1.5">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Configure other providers
        </summary>
        <div className="mt-3 rounded-lg border border-border/30 bg-card/30 divide-y divide-border/20">
          {PROVIDERS.filter((p) => p.name !== settings.defaultProvider && p.requiresKey).map((provider) => (
            <div key={provider.name} className="px-4 py-3 space-y-1.5">
              <Label htmlFor={`ai-other-${provider.name}`} className="text-[11px] font-semibold flex items-center gap-2">
                {provider.label}
                <span className="font-normal text-muted-foreground/50">{provider.description}</span>
              </Label>
              <SecretInput
                id={`ai-other-${provider.name}`}
                value={(settings[provider.keyField!] as string) ?? ""}
                onChange={(v) => update({ [provider.keyField!]: v })}
                placeholder={provider.keyPlaceholder}
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
