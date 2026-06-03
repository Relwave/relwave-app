import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Bot, AlertCircle, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  markdown?: string;
  loading?: boolean;
  error?: string | null;
}

/**
 * Reusable dialog that renders AI-generated markdown output.
 * Used by Schema Analysis and Query Explanation features.
 */
export function AIResultDialog({
  open,
  onOpenChange,
  title,
  description,
  markdown,
  loading,
  error,
}: AIResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-md bg-primary/10 ring-1 ring-primary/20">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs">{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="p-3 rounded-2xl bg-primary/8 ring-1 ring-primary/20">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              </div>
              <p className="text-xs text-muted-foreground/70">Analyzing with AI…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="p-3 rounded-2xl bg-destructive/8 ring-1 ring-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive/70" />
              </div>
              <p className="text-xs font-semibold text-destructive/80">Analysis failed</p>
              <p className="text-[11px] text-muted-foreground/60 text-center max-w-sm leading-relaxed">
                {error}
              </p>
              <p className="text-[11px] text-muted-foreground/50 text-center max-w-sm">
                Make sure your AI provider is configured in{" "}
                <span className="font-semibold text-primary/70">Settings → AI Settings</span>.
              </p>
            </div>
          ) : markdown ? (
            <MarkdownRenderer content={markdown} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="p-3 rounded-2xl bg-muted/50 ring-1 ring-border/30">
                <Sparkles className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground/60">No content yet.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lightweight markdown renderer — no heavy library needed.
 * Handles headings, bold, code blocks, bullet lists, and paragraphs.
 */
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={i} code={codeLines.join("\n")} lang={lang} />
      );
      i++;
      continue;
    }

    // H1–H3 headings
    const h3 = line.match(/^###\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      elements.push(<h3 key={i} className="text-sm font-bold mt-4 mb-1.5 text-foreground/90">{renderInline(h1[1])}</h3>);
      i++; continue;
    }
    if (h2) {
      elements.push(<h4 key={i} className="text-[13px] font-semibold mt-3 mb-1 text-foreground/85 border-b border-border/20 pb-1">{renderInline(h2[1])}</h4>);
      i++; continue;
    }
    if (h3) {
      elements.push(<h5 key={i} className="text-xs font-semibold mt-2 mb-1 text-foreground/80">{renderInline(h3[1])}</h5>);
      i++; continue;
    }

    // Bullet list items
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      const items: string[] = [bullet[1]];
      i++;
      while (i < lines.length && lines[i].match(/^[-*]\s+(.+)$/)) {
        items.push(lines[i].match(/^[-*]\s+(.+)$/)![1]);
        i++;
      }
      elements.push(
        <ul key={i} className="my-2 list-disc pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-xs text-foreground/80 leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-xs text-foreground/80 leading-relaxed my-1">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5 p-1">{elements}</div>;
}

/** Render bold (**text**) and inline code (`code`) within a text node. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-primary/80">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  return (
    <div className="relative group my-3">
      <pre
        className={cn(
          "rounded-md border border-border/30 bg-muted/40 pl-3 pr-10 py-2.5 text-[11px] font-mono leading-relaxed overflow-x-auto",
          lang === "sql" && "text-primary/90"
        )}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className={cn(
          "absolute top-2 right-2 p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 border border-border/30 shadow-xs cursor-pointer md:opacity-0 md:group-hover:opacity-100 focus:opacity-100",
          copied && "opacity-100 text-emerald-500 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20"
        )}
        title="Copy code"
        type="button"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
