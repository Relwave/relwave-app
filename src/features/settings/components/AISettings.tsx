import { useState, useEffect } from "react";
import { Bot, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ChevronDown, Zap, Scale, Brain, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AIProviderName,
  type AISettings as AISettingsData,
  loadAISettings,
  saveAISettings,
  aiService,
} from "@/services/bridge/ai";

// ── Model catalog ─────────────────────────────────────────────────────────

type ModelTier = "fast" | "balanced" | "powerful";

interface ModelOption {
  value: string;
  label: string;
  tier: ModelTier;
}

const MODEL_OPTIONS: Partial<Record<AIProviderName, ModelOption[]>> = {
  anthropic: [
    { value: "claude-3-5-haiku-20241022", label: "Haiku 3.5", tier: "fast" },
    { value: "claude-3-5-sonnet-20241022", label: "Sonnet 3.5", tier: "balanced" },
    { value: "claude-3-7-sonnet-20250219", label: "Sonnet 3.7", tier: "balanced" },
    { value: "claude-opus-4-5", label: "Opus 4.5", tier: "powerful" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini", tier: "fast" },
    { value: "gpt-4o", label: "GPT-4o", tier: "balanced" },
    { value: "o1-mini", label: "o1 Mini", tier: "balanced" },
    { value: "o1", label: "o1", tier: "powerful" },
    { value: "o3-mini", label: "o3 Mini", tier: "powerful" },
  ],
  gemini: [
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "fast" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "balanced" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "fast" },
    { value: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro", tier: "powerful" },
  ],
  groq: [
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", tier: "fast" },
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", tier: "balanced" },
    { value: "moonshotai/kimi-k2-instruct", label: "Kimi K2", tier: "powerful" },
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small", tier: "fast" },
    { value: "mistral-medium-latest", label: "Mistral Medium", tier: "balanced" },
    { value: "mistral-large-latest", label: "Mistral Large", tier: "powerful" },
    { value: "codestral-latest", label: "Codestral", tier: "powerful" },
  ],
};

// Map provider name to the settings key that stores its model
const MODEL_FIELD: Partial<Record<AIProviderName, keyof AISettingsData>> = {
  anthropic: "anthropicModel",
  openai: "openaiModel",
  gemini: "geminiModel",
  groq: "groqModel",
  mistral: "mistralModel",
};

// ── Provider metadata ─────────────────────────────────────────────────────

interface ProviderMeta {
  name: AIProviderName;
  label: string;
  defaultModelLabel: string;
  requiresKey: boolean;
  keyField?: keyof AISettingsData;
  keyPlaceholder?: string;
  docsUrl?: string;
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
    defaultModelLabel: "Haiku 3.5",
    requiresKey: true,
    keyField: "anthropicApiKey",
    keyPlaceholder: "sk-ant-api03-…",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    name: "openai",
    label: "OpenAI",
    defaultModelLabel: "GPT-4o Mini",
    requiresKey: true,
    keyField: "openaiApiKey",
    keyPlaceholder: "sk-proj-…",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    name: "gemini",
    label: "Gemini (Google)",
    defaultModelLabel: "Gemini 1.5 Flash",
    requiresKey: true,
    keyField: "geminiApiKey",
    keyPlaceholder: "AIzaSy…",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    name: "groq",
    label: "Groq",
    defaultModelLabel: "Llama 3.3 70B",
    requiresKey: true,
    keyField: "groqApiKey",
    keyPlaceholder: "gsk_…",
    docsUrl: "https://console.groq.com/keys",
  },
  {
    name: "mistral",
    label: "Mistral",
    defaultModelLabel: "Mistral Small",
    requiresKey: true,
    keyField: "mistralApiKey",
    keyPlaceholder: "…",
    docsUrl: "https://console.mistral.ai/api-keys",
  },
  {
    name: "ollama",
    label: "Ollama (Local)",
    defaultModelLabel: "llama3.2",
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

// ── Tier badge ────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<ModelTier, { label: string; icon: typeof Zap; className: string }> = {
  fast: {
    label: "Fast",
    icon: Zap,
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  balanced: {
    label: "Balanced",
    icon: Scale,
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  powerful: {
    label: "Powerful",
    icon: Brain,
    className: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
};

function TierBadge({ tier }: { tier: ModelTier }) {
  const { label, icon: Icon, className } = TIER_CONFIG[tier];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", className)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ── Model selector ────────────────────────────────────────────────────────

function ModelSelector({
  provider,
  value,
  onChange,
}: {
  provider: AIProviderName;
  value: string | undefined;
  onChange: (model: string) => void;
}) {
  const options = MODEL_OPTIONS[provider];
  if (!options || options.length === 0) return null;

  const selected = options.find((o) => o.value === value) ?? options[0];

  const byTier: Record<ModelTier, ModelOption[]> = { fast: [], balanced: [], powerful: [] };
  options.forEach((o) => byTier[o.tier].push(o));

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
        Model
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-between text-xs border-border/40 font-normal"
          >
            <span className="flex items-center gap-2">
              <span>{selected.label}</span>
              <TierBadge tier={selected.tier} />
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {(["fast", "balanced", "powerful"] as ModelTier[]).map((tier) => {
            const tierOptions = byTier[tier];
            if (tierOptions.length === 0) return null;
            const { label, icon: Icon, className: badgeCls } = TIER_CONFIG[tier];
            return (
              <div key={tier}>
                <DropdownMenuLabel className={cn("text-[10px] flex items-center gap-1.5 font-semibold py-1.5", `text-${tier === "fast" ? "emerald" : tier === "balanced" ? "blue" : "purple"}-500`)}>
                  <Icon className="h-3 w-3" />
                  {label}
                </DropdownMenuLabel>
                {tierOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    className={cn(
                      "flex items-center justify-between text-xs cursor-pointer",
                      opt.value === selected.value && "bg-primary/8 text-primary font-medium"
                    )}
                    onClick={() => onChange(opt.value)}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[130px]">{opt.value}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            );
          })}
          <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground/50 pt-0 pb-1">
            Selected: <span className="font-mono">{selected.value}</span>
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Connection status ─────────────────────────────────────────────────────

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

// ── Password field ────────────────────────────────────────────────────────

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
  const [settings, setSettings] = useState<AISettingsData>({ defaultProvider: "ollama" });
  const [isLoading, setIsLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  // Load from bridge (ai-settings.json) on mount
  useEffect(() => {
    loadAISettings().then((loaded) => {
      setSettings(loaded);
      setIsLoading(false);
    });
  }, []);

  const activeProvider = PROVIDERS.find((p) => p.name === settings.defaultProvider) ?? PROVIDERS[0];

  const update = (patch: Partial<AISettingsData>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setStatus("idle");
  };

  const handleSave = async () => {
    await saveAISettings(settings);
    setDirty(false);
    setStatus("idle");
  };

  const handleTest = async () => {
    await saveAISettings(settings);
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

  // Get the currently selected model label for the provider description
  const activeModelField = MODEL_FIELD[activeProvider.name];
  const activeModelValue = activeModelField ? (settings[activeModelField] as string | undefined) : undefined;
  const activeModelOptions = MODEL_OPTIONS[activeProvider.name] ?? [];
  const activeModelInfo = activeModelOptions.find((o) => o.value === activeModelValue) ?? activeModelOptions[0];

  // Which providers already have keys saved (excluding ollama which needs no key)
  const configuredProviders = PROVIDERS.filter((p) => {
    if (!p.requiresKey || !p.keyField) return false;
    return !!((settings[p.keyField] as string | undefined)?.trim());
  });
  const configuredCount = configuredProviders.length;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted/50" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 bg-muted/50 rounded" />
            <div className="h-2.5 w-40 bg-muted/30 rounded" />
          </div>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/30 h-36" />
      </div>
    );
  }

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
            Configure your AI provider and model. Keys stay on your machine.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30">
        {/* Provider selector */}
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Active Provider</Label>
            <p className="text-[11px] text-muted-foreground/60">
              {activeModelInfo ? `${activeModelInfo.label} · ` : ""}{activeProvider.label}
            </p>
            {configuredCount > 0 && (
              <p className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5 pt-0.5">
                <span className="flex items-center gap-1">
                  {configuredProviders.map((p) => (
                    <span key={p.name} title={`${p.label} key saved`} className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-500/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      {p.label.split(" ")[0]}
                    </span>
                  ))}
                </span>
                <span className="text-muted-foreground/30">saved</span>
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-2 border-border/40 min-w-[160px] justify-between">
                {activeProvider.label}
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {PROVIDERS.map((p) => {
                const hasKey = p.requiresKey && p.keyField
                  ? !!((settings[p.keyField] as string | undefined)?.trim())
                  : !p.requiresKey; // ollama always "configured"
                return (
                  <DropdownMenuItem
                    key={p.name}
                    className={cn(
                      "flex items-center gap-2 text-xs py-2",
                      p.name === settings.defaultProvider && "bg-primary/8 text-primary font-medium"
                    )}
                    onClick={() => update({ defaultProvider: p.name })}
                  >
                    {/* Green dot = key saved, grey = not configured */}
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        hasKey ? "bg-emerald-500" : "bg-muted-foreground/25"
                      )}
                      title={hasKey ? "API key saved" : "No key saved"}
                    />
                    <div className="flex flex-col min-w-0">
                      <span>{p.label}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">{p.defaultModelLabel}</span>
                    </div>
                    {p.name === settings.defaultProvider && (
                      <span className="ml-auto text-[9px] text-primary/70 font-semibold uppercase tracking-wider shrink-0">Active</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
              {configuredCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground/50">
                    {configuredCount} provider{configuredCount !== 1 ? "s" : ""} with saved keys — switching won't delete them.
                  </DropdownMenuLabel>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Credential + model fields for the active provider */}
        <div className="p-4 space-y-3">
          {/* API Key */}
          {activeProvider.requiresKey && activeProvider.keyField && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`ai-key-${activeProvider.name}`} className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                  API Key
                </Label>
                {activeProvider.docsUrl && (
                  <a
                    href={activeProvider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors"
                  >
                    Get key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <SecretInput
                id={`ai-key-${activeProvider.name}`}
                value={(settings[activeProvider.keyField] as string) ?? ""}
                onChange={(v) => update({ [activeProvider.keyField!]: v })}
                placeholder={activeProvider.keyPlaceholder}
              />
            </div>
          )}

          {/* Model selector (for providers with a model catalog) */}
          {activeProvider.name !== "ollama" && MODEL_FIELD[activeProvider.name] && (
            <ModelSelector
              provider={activeProvider.name}
              value={(settings[MODEL_FIELD[activeProvider.name]!] as string | undefined)}
              onChange={(model) => update({ [MODEL_FIELD[activeProvider.name]!]: model })}
            />
          )}

          {/* Extra fields (Ollama base URL / model text input) */}
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

      {/* Configure other providers (collapsed) */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors select-none list-none flex items-center gap-1.5">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Configure other providers
        </summary>
        <div className="mt-3 rounded-lg border border-border/30 bg-card/30 divide-y divide-border/20">
          {PROVIDERS.filter((p) => p.name !== settings.defaultProvider && p.requiresKey).map((provider) => {
            const modelField = MODEL_FIELD[provider.name];
            const modelOptions = MODEL_OPTIONS[provider.name] ?? [];
            const selectedModel = modelField ? (settings[modelField] as string | undefined) : undefined;
            const selectedModelInfo = modelOptions.find((o) => o.value === selectedModel) ?? modelOptions[0];
            return (
              <div key={provider.name} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`ai-other-${provider.name}`} className="text-[11px] font-semibold flex items-center gap-2">
                    {provider.label}
                    {selectedModelInfo && (
                      <TierBadge tier={selectedModelInfo.tier} />
                    )}
                  </Label>
                  {provider.docsUrl && (
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1">
                      Get key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <SecretInput
                  id={`ai-other-${provider.name}`}
                  value={(settings[provider.keyField!] as string) ?? ""}
                  onChange={(v) => update({ [provider.keyField!]: v })}
                  placeholder={provider.keyPlaceholder}
                />
                {modelField && modelOptions.length > 0 && (
                  <ModelSelector
                    provider={provider.name}
                    value={selectedModel}
                    onChange={(model) => update({ [modelField]: model })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
