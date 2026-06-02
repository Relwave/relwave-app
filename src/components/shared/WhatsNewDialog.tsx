import { useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type StoredInstalledUpdate = {
  version: string;
  body?: string;
  date?: string;
  previousVersion?: string;
  installedAt?: string;
};

type NoteSection = {
  title: string;
  items: string[];
};

/**
 * Written by useUpdater after a successful in-app download.
 * Contains the release body, date, previousVersion, etc.
 */
const LAST_INSTALLED_UPDATE_KEY = "relwave:last-installed-update";

/**
 * Written on every launch with the current app version.
 * Used to detect version changes across manual installs, where the
 * in-app updater never runs and LAST_INSTALLED_UPDATE_KEY is never set.
 */
const LAST_SEEN_VERSION_KEY = "relwave:last-seen-version";

const TITLE_MAP: Record<string, string> = {
  new: "New",
  added: "New",
  improvements: "Improved",
  improved: "Improved",
  changes: "Improved",
  changed: "Improved",
  fixes: "Fixed",
  fixed: "Fixed",
  bugfixes: "Fixed",
  bugs: "Fixed",
  security: "Security",
};

const FALLBACK_SECTIONS: NoteSection[] = [
  {
    title: "Highlights",
    items: [
      "General improvements and bug fixes.",
      "Better stability and performance.",
      "Quality updates to the update and database workflows.",
    ],
  },
];

function normalizeSectionTitle(title: string): string {
  const key = title.trim().toLowerCase().replace(/[^a-z]/g, "");
  return TITLE_MAP[key] ?? title.trim();
}

function parseReleaseBody(body?: string): NoteSection[] {
  if (!body || !body.trim()) {
    return FALLBACK_SECTIONS;
  }

  // GitHub generates a default `notes` value when no release notes are written.
  // Treat it (and similar content-free strings) as "no notes" so we fall back
  // to the generic highlights instead of surfacing a useless placeholder.
  const KNOWN_PLACEHOLDERS = [
    "see the assets to download this version and install",
    "no release notes provided",
  ];
  const normalized = body.trim().toLowerCase();
  if (KNOWN_PLACEHOLDERS.some((p) => normalized === p || normalized.startsWith(p))) {
    return FALLBACK_SECTIONS;
  }

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return FALLBACK_SECTIONS;
  }

  const sections: NoteSection[] = [];
  let current: NoteSection = { title: "Highlights", items: [] };

  const pushCurrentIfNeeded = () => {
    if (current.items.length > 0) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      pushCurrentIfNeeded();
      current = { title: normalizeSectionTitle(headingMatch[1]), items: [] };
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      current.items.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      current.items.push(numberedMatch[1].trim());
      continue;
    }

    // Treat plain text lines as standalone highlights.
    current.items.push(line);
  }

  pushCurrentIfNeeded();

  if (!sections.length) {
    return FALLBACK_SECTIONS;
  }

  // Merge duplicate section titles while preserving order.
  const merged: NoteSection[] = [];
  for (const section of sections) {
    const existing = merged.find((entry) => entry.title === section.title);
    if (existing) {
      existing.items.push(...section.items);
      continue;
    }
    merged.push({ title: section.title, items: [...section.items] });
  }

  return merged;
}

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");
  const [releaseInfo, setReleaseInfo] = useState<StoredInstalledUpdate | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const installedVersion = await getVersion();
        if (!mounted) return;

        setCurrentVersion(installedVersion);

        const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);

        // Show the dialog whenever the stored version differs from the current
        // version. This covers both in-app updater installs AND manual installs
        // where useUpdater never runs (so LAST_INSTALLED_UPDATE_KEY is absent).
        const isNewVersion =
          !lastSeenVersion || lastSeenVersion !== installedVersion;

        if (!isNewVersion) return;

        // Try to read the richer update payload written by useUpdater (contains
        // the release body, date, previous version, etc.).  If it's absent or
        // for a different version we still show the dialog — just with fallback
        // content rather than nothing at all.
        let parsed: StoredInstalledUpdate | null = null;
        const raw = localStorage.getItem(LAST_INSTALLED_UPDATE_KEY);
        if (raw) {
          try {
            const candidate = JSON.parse(raw) as StoredInstalledUpdate;
            // Only use the payload if it matches the installed version.
            if (candidate.version === installedVersion) {
              parsed = candidate;
            }
          } catch {
            localStorage.removeItem(LAST_INSTALLED_UPDATE_KEY);
          }
        }

        // Fall back to a minimal record so the dialog still shows useful info.
        if (!parsed) {
          parsed = {
            version: installedVersion,
            previousVersion: lastSeenVersion ?? undefined,
          };
        }

        setReleaseInfo(parsed);
        setOpen(true);
      } catch {
        // Non-fatal: if version cannot be read, skip popup.
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const sections = useMemo(() => parseReleaseBody(releaseInfo?.body), [releaseInfo?.body]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && currentVersion) {
      // Record that the user has seen the dialog for this version.
      // Both keys are updated so future launches don't re-show the dialog.
      localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
      localStorage.removeItem(LAST_INSTALLED_UPDATE_KEY);
    }
    setOpen(nextOpen);
  };

  if (!releaseInfo) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What&apos;s New in v{releaseInfo.version}
          </DialogTitle>
          <DialogDescription>
            {releaseInfo.previousVersion
              ? `Updated from v${releaseInfo.previousVersion} to v${releaseInfo.version}`
              : "Thanks for updating RelWave."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-3 overflow-auto rounded-md border border-border/40 bg-muted/20 p-3">
          {sections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="rounded-md border border-border/30 bg-background/70 p-3">
              <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {section.items.map((item, itemIndex) => (
                  <li key={`${itemIndex}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => handleClose(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
