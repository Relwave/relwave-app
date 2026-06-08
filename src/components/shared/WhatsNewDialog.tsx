import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Sparkles, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const GITHUB_REPO = "Relwave/relwave-app";

const LAST_SEEN_VERSION_KEY = "relwave:last-seen-version";

type ReleaseInfo = {
  version: string;
  body?: string;
  previousVersion?: string;
};

const FALLBACK_BODY = `
## Highlights
- General improvements and bug fixes.
- Better stability and performance.
- Quality updates to the update and database workflows.
`.trim();

async function fetchReleaseNotes(version: string): Promise<string | undefined> {
  const cacheKey = `relwave:release-notes-${version}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const body: string | undefined = data.body ?? undefined;
    if (body) localStorage.setItem(cacheKey, body);
    return body;
  } catch {
    return undefined;
  }
}

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const installedVersion = await getVersion();
        if (!mounted) return;

        const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
        const isNewVersion = !lastSeenVersion || lastSeenVersion !== installedVersion;
        if (!isNewVersion) return;

        setLoading(true);
        const body = await fetchReleaseNotes(installedVersion);
        if (!mounted) return;

        setReleaseInfo({
          version: installedVersion,
          previousVersion: lastSeenVersion ?? undefined,
          body: body ?? FALLBACK_BODY,
        });
        setLoading(false);
        setOpen(true);
      } catch {
        setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, []);

  // Dev-only: Cmd+Shift+W resets and reloads
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === "W") {
        localStorage.removeItem(LAST_SEEN_VERSION_KEY);
        Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
          .filter((k) => k?.startsWith("relwave:release-notes-"))
          .forEach((k) => k && localStorage.removeItem(k));
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && releaseInfo?.version) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, releaseInfo.version);
    }
    setOpen(nextOpen);
  };

  if (!releaseInfo && !loading) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-border/50 space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex-shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-tight">
                What's new in RelWave
              </DialogTitle>
              <div className="flex items-center gap-1.5 mt-1">
                {releaseInfo?.previousVersion && (
                  <>
                    <span className="text-xs text-muted-foreground font-mono">
                      v{releaseInfo.previousVersion}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                  </>
                )}
                <span className="text-xs font-mono font-medium text-foreground">
                  v{releaseInfo?.version}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              {[80, 60, 90, 50, 70].map((w, i) => (
                <div
                  key={i}
                  className="h-3 rounded-full bg-muted animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-base font-semibold text-foreground mt-5 mb-2 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-semibold text-foreground mt-5 mb-2 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-medium text-foreground/90 mt-4 mb-1.5">
                    {children}
                  </h3>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-1.5 mb-3">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="space-y-1.5 mb-3 list-decimal pl-4">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2.5 text-sm text-foreground/80 leading-relaxed">
                    <span className="mt-[9px] w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    <span>{children}</span>
                  </li>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-foreground/70 leading-relaxed mb-2">
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className="font-medium text-foreground">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-foreground/60">{children}</em>
                ),
                hr: () => (
                  <hr className="border-border/40 my-4" />
                ),
                code: ({ children, className }) => {
                  const isBlock = !!className;
                  return isBlock ? (
                    <code className="block text-xs bg-muted rounded-md px-3 py-2 font-mono text-foreground/80 my-2 overflow-x-auto">
                      {children}
                    </code>
                  ) : (
                    <code className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono text-foreground/80">
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                  >
                    {children}
                  </a>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground/60 italic my-2">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {releaseInfo?.body ?? ""}
            </ReactMarkdown>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border/50 bg-muted/20 flex-row items-center justify-between gap-4 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Thanks for keeping RelWave up to date.
          </p>
          <Button size="sm" onClick={() => handleClose(false)} disabled={loading}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent >
    </Dialog >
  );
}