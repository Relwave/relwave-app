/**
 * CommandPalette.tsx
 *
 * Typography:
 *   UI text  → IBM Plex Sans (400 / 450 / 600)
 *   Mono     → IBM Plex Mono  — kbd hints, badges, meta/schema, search query echo
 *
 * Load both in your root HTML or global CSS:
 *   <link rel="preconnect" href="https://fonts.googleapis.com" />
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
 *   <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
 *
 * Or in global CSS:
 *   @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
 *
 *   .font-sans   { font-family: 'IBM Plex Sans', sans-serif; }
 *   .font-mono { font-family: 'IBM Plex Mono', monospace; }
 */

import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Settings,
  Database,
  Table as TableIcon,
  Terminal,
  Home,
  FolderOpen,
  Moon,
  Sun,
  Palette,
  Plus,
  Search,
  Clock,
  Zap,
} from "lucide-react";

import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDatabases, useTables } from "@/features/project/hooks/useDbQueries";
import { useProjects } from "@/features/project/hooks/useProjectQueries";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemType = "page" | "connection" | "project" | "action" | "table";

interface RecentItem {
  id: string;
  type: ItemType;
  label: string;
  path?: string;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_ITEMS_KEY = "relwave-recent-commands";
const MAX_RECENT = 5;
const THEME_VARIANTS = ["blue", "purple", "green", "orange", "zinc"] as const;

const TYPE_COLORS: Record<ItemType, string> = {
  page: "bg-sky-500/10     text-sky-400     border-sky-500/20",
  connection: "bg-violet-500/10  text-violet-400  border-violet-500/20",
  project: "bg-amber-500/10   text-amber-400   border-amber-500/20",
  action: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  table: "bg-rose-500/10    text-rose-400    border-rose-500/20",
};

const TYPE_LABELS: Record<ItemType, string> = {
  page: "PAGE",
  connection: "DB",
  project: "PROJ",
  action: "CMD",
  table: "TBL",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Monospaced badge — uppercase, tight tracking, very small.
 * Uses IBM Plex Mono so the letters feel "typed", matching the DB-tool context.
 */
function ItemBadge({ type }: { type: ItemType }) {
  return (
    <span
      className={cn(
        // font-mono resolves to IBM Plex Mono via your global CSS / Tailwind config
        "ml-auto shrink-0 rounded border px-1.5 py-[2px]",
        "font-mono text-[9.5px] font-medium tracking-[0.12em]",
        TYPE_COLORS[type]
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

/**
 * Keyboard hint keys.
 * IBM Plex Mono at 10px with medium weight is the gold standard for kbd glyphs.
 */
function KbdHint({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && (
            <span className="font-mono text-[9px] text-muted-foreground/40 mx-px">+</span>
          )}
          <kbd
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border",
              "border-sidebar-border bg-sidebar px-1",
              // IBM Plex Mono — characters are narrower so ↑↓↵ sit better
              "font-mono text-[10px] font-medium text-muted-foreground/70",
              "leading-none"
            )}
          >
            {k}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Empty state shown when search returns nothing. */
function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-sidebar-border text-muted-foreground/40">
        <Search className="h-3.5 w-3.5" />
      </div>
      <div className="space-y-0.5">
        {/* IBM Plex Sans 500 — slightly heavier so it reads as a label, not body */}
        <p className="font-sans text-[13px] font-medium text-foreground/50 tracking-tight">
          No results
        </p>
        {/* IBM Plex Mono for the echoed query — makes the search term look "literal" */}
        <p className="font-mono text-[11px] text-muted-foreground/40">
          &ldquo;{query}&rdquo;
        </p>
      </div>
    </div>
  );
}

/**
 * Highlights the matched substring in a result label.
 * Non-matching text: IBM Plex Sans 400 (normal weight).
 * Matching text:     IBM Plex Sans 600 (semibold) + primary color.
 *
 * We do NOT switch to a heavier weight class on the whole string to avoid
 * layout shift as the user types — only the matched slice gets heavier.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-primary">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const { data: databases = [] } = useDatabases();
  const { data: projects = [] } = useProjects();

  const dbId = React.useMemo(() => {
    const parts = location.pathname.split("/");
    if (parts.length === 2 && parts[1] && !["settings"].includes(parts[1])) {
      return parts[1];
    }
    return null;
  }, [location.pathname]);

  const { data: tables = [] } = useTables(dbId ?? undefined);

  // ── Recent items ────────────────────────────────────────────────────────────
  const [recentItems, setRecentItems] = React.useState<RecentItem[]>([]);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_ITEMS_KEY);
      if (saved) setRecentItems(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const addToRecent = React.useCallback((item: Omit<RecentItem, "timestamp">) => {
    setRecentItems((prev) => {
      const filtered = prev.filter((i) => i.id !== item.id);
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecent = React.useCallback(() => {
    setRecentItems([]);
    localStorage.removeItem(RECENT_ITEMS_KEY);
  }, []);

  // ── Keyboard shortcut ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (!open) setTimeout(() => setSearch(""), 200);
  }, [open]);

  const runCommand = React.useCallback(
    (command: () => void, item?: Omit<RecentItem, "timestamp">) => {
      setOpen(false);
      command();
      if (item) addToRecent(item);
    },
    [addToRecent]
  );

  const pages = React.useMemo(() => [
    { icon: Home, label: "Dashboard", path: "/" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ], []);

  const isSearching = search.trim().length > 0;
  const showRecent = !isSearching && recentItems.length > 0;

  const contextLabel = React.useMemo(() => {
    if (!dbId) return null;
    const db = databases.find((d) => d.id === dbId);
    return db ? db.name : dbId;
  }, [dbId, databases]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 shadow-2xl border-sidebar-border bg-sidebar/95 backdrop-blur-xl max-w-[560px]"
      >
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-md bg-transparent"
          shouldFilter
          loop
        >
          {/* ── Search bar ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-sidebar-border px-3">
            <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground/60" />

            <Command.Input
              placeholder="Search commands, pages, connections…"
              className={cn(
                "flex h-12 w-full bg-transparent py-3 outline-none",
                // IBM Plex Sans 400, slightly larger than item text for prominence
                "font-sans text-[14px] font-normal tracking-[-0.01em]",
                "placeholder:text-muted-foreground/40 text-foreground"
              )}
              value={search}
              onValueChange={setSearch}
            />

            {/* Active DB context pill */}
            {contextLabel && !isSearching && (
              <div className={cn(
                "flex items-center gap-1 rounded border border-sidebar-border bg-sidebar/60 px-2 py-1",
                "font-mono text-[10.5px] text-muted-foreground/60 whitespace-nowrap"
              )}>
                <Database className="h-3 w-3" />
                {contextLabel}
              </div>
            )}

            {isSearching && (
              <button
                onClick={() => setSearch("")}
                className="font-sans text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          {/* ── List ─────────────────────────────────────────────────────── */}
          <Command.List className="max-h-[420px] overflow-y-auto overflow-x-hidden p-1.5 scrollbar-thin">
            <Command.Empty>{<EmptyState query={search} />}</Command.Empty>

            {/* Recent */}
            {showRecent && (
              <Command.Group
                heading={
                  <GroupHeading
                    label="Recent"
                    icon={<Clock className="h-3 w-3" />}
                    action={
                      <button
                        onClick={clearRecent}
                        className="font-mono text-[9.5px] tracking-wide text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors uppercase"
                      >
                        Clear
                      </button>
                    }
                  />
                }
              >
                {recentItems.map((item) => (
                  <CommandItem
                    key={`recent-${item.id}`}
                    valuePrefix="recent-"
                    icon={
                      item.type === "connection" ? Database :
                        item.type === "project" ? FolderOpen : Home
                    }
                    label={item.label}
                    type={item.type}
                    query={search}
                    onSelect={() => {
                      if (item.path) runCommand(() => navigate(item.path!), item);
                    }}
                  />
                ))}
              </Command.Group>
            )}

            {/* Pages */}
            <Command.Group heading={<GroupHeading label="Pages" />}>
              {pages.map((page) => (
                <CommandItem
                  key={page.path}
                  icon={page.icon}
                  label={page.label}
                  type="page"
                  query={search}
                  onSelect={() =>
                    runCommand(() => navigate(page.path), {
                      id: page.path, type: "page", label: page.label, path: page.path,
                    })
                  }
                />
              ))}
            </Command.Group>

            {/* Connections */}
            {databases.length > 0 && (
              <Command.Group heading={<GroupHeading label="Connections" />}>
                {databases.map((db) => (
                  <CommandItem
                    key={db.id}
                    icon={Database}
                    label={db.name}
                    type="connection"
                    query={search}
                    meta={`${db.type} · ${db.host}`}
                    onSelect={() =>
                      runCommand(() => navigate(`/${db.id}`), {
                        id: db.id, type: "connection", label: db.name, path: `/${db.id}`,
                      })
                    }
                  />
                ))}
              </Command.Group>
            )}

            {/* Tables */}
            {tables.length > 0 && (
              <Command.Group heading={<GroupHeading label={`Tables · ${contextLabel ?? dbId}`} mono />}>
                {tables.map((table) => (
                  <CommandItem
                    key={`${dbId}-${table.schema}-${table.name}`}
                    icon={TableIcon}
                    label={table.name}
                    type="table"
                    query={search}
                    meta={table.schema}
                    onSelect={() => runCommand(() => navigate(`/${dbId}`))}
                  />
                ))}
              </Command.Group>
            )}

            {/* Projects — navigate to linked database */}
            {projects.length > 0 && (
              <Command.Group heading={<GroupHeading label="Projects" />}>
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    icon={FolderOpen}
                    label={project.name}
                    type="project"
                    query={search}
                    onSelect={() =>
                      runCommand(() => navigate(`/${project.databaseId}`), {
                        id: project.id, type: "project", label: project.name, path: `/${project.databaseId}`,
                      })
                    }
                  />
                ))}
              </Command.Group>
            )}

            {/* Actions */}
            <Command.Group heading={<GroupHeading label="Actions" />}>
              <CommandItem
                icon={Plus}
                label="New Connection"
                type="action"
                query={search}
                onSelect={() =>
                  runCommand(() => navigate("/", { state: { openAddConnection: true } }))
                }
              />

              {dbId && (
                <CommandItem
                  icon={Terminal}
                  label="Open SQL Workspace"
                  type="action"
                  query={search}
                  meta={contextLabel ?? dbId}
                  onSelect={() =>
                    runCommand(() =>
                      navigate(`/${dbId}`, { state: { activePanel: "sql-workspace" } })
                    )
                  }
                />
              )}

              <CommandItem
                icon={theme === "light" ? Moon : Sun}
                label={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                type="action"
                query={search}
                onSelect={() =>
                  runCommand(() => setTheme(theme === "light" ? "dark" : "light"))
                }
              />

              {THEME_VARIANTS.map((variant) => (
                <CommandItem
                  key={`theme-${variant}`}
                  icon={Palette}
                  label={`Theme: ${variant.charAt(0).toUpperCase() + variant.slice(1)}`}
                  type="action"
                  query={search}
                  onSelect={() =>
                    runCommand(() => {
                      document.documentElement.setAttribute("data-theme-variant", variant);
                      localStorage.setItem("relwave-theme-variant", variant);
                    })
                  }
                />
              ))}
            </Command.Group>
          </Command.List>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-2">
            <div className="flex items-center gap-3">
              {[
                { keys: ["↑", "↓"], label: "navigate" },
                { keys: ["↵"], label: "select" },
                { keys: ["esc"], label: "close" },
              ].map(({ keys, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <KbdHint keys={keys} />
                  {/* IBM Plex Sans 400, very small, subdued */}
                  <span className="font-sans text-[10.5px] text-muted-foreground/40">{label}</span>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <Zap className="h-2.5 w-2.5 text-muted-foreground/30" />
              <KbdHint keys={["⌘", "K"]} />
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ─── GroupHeading ─────────────────────────────────────────────────────────────

/**
 * Section group labels.
 * IBM Plex Sans 600, 10px, very wide tracking + uppercase — the classic
 * "nav section label" pattern, but with Plex's geometric punch.
 * mono=true switches to IBM Plex Mono (used for table names that are identifiers).
 */
function GroupHeading({
  label,
  icon,
  action,
  mono = false,
}: {
  label: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "flex items-center gap-1.5",
          mono
            ? "font-mono text-[10px] font-medium tracking-[0.06em] text-muted-foreground/50"
            : "font-sans  text-[10px] font-semibold tracking-[0.1em] text-muted-foreground/50 uppercase"
        )}
      >
        {icon}
        {label}
      </span>
      {action}
    </div>
  );
}

// ─── CommandItem ──────────────────────────────────────────────────────────────

interface CommandItemProps {
  icon: React.ElementType;
  label: string;
  type: ItemType;
  query: string;
  meta?: string;
  suffix?: React.ReactNode;
  onSelect: () => void;
  /** Prefix injected into cmdk's `value` to prevent deduplication collisions.
   *  Recent items must pass "recent-" so they don't share a value key with the
   *  same item appearing in its real group — cmdk silently skips duplicates,
   *  which breaks ↑↓ keyboard navigation whenever the Recent section is shown. */
  valuePrefix?: string;
}

function CommandItem({ icon: Icon, label, type, query, meta, suffix, onSelect, valuePrefix = "" }: CommandItemProps) {
  return (
    <Command.Item
      value={`${valuePrefix}${type}-${label}`}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-[7px]",
        "outline-none transition-colors",
        "data-[selected='true']:bg-primary/10 data-[selected='true']:text-foreground",
        "text-foreground/75 hover:bg-sidebar-accent"
      )}
    >
      {/* Tinted icon tile */}
      <div className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border",
        TYPE_COLORS[type]
      )}>
        <Icon className="h-3 w-3" />
      </div>

      {/* Label — IBM Plex Sans 450 (between regular and medium) */}
      <span className={cn(
        "flex-1 truncate font-sans text-[13px] leading-none",
        // font-[450] is supported in Tailwind v3.3+ via arbitrary value
        // Falls back gracefully to 400 on older setups
        "font-[450] tracking-[-0.005em]"
      )}>
        <HighlightMatch text={label} query={query} />
      </span>

      {/* Meta — IBM Plex Mono, very subdued */}
      {meta && (
        <span className="shrink-0 truncate font-mono text-[10.5px] text-muted-foreground/40 max-w-[130px]">
          {meta}
        </span>
      )}

      {/* Badge or custom suffix */}
      {suffix ?? <ItemBadge type={type} />}
    </Command.Item>
  );
}
