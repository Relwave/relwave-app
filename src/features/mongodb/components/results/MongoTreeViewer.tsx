import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMongoValue } from "../MongoDocumentCell";
import { cn } from "@/lib/utils";

// Threshold for large tree safeguards during Expand All
export const LARGE_TREE_NODE_LIMIT = 500;
export const LARGE_TREE_DEPTH_LIMIT = 5;

/**
 * Detects whether an object is a MongoDB Extended JSON (EJSON v2) BSON wrapper.
 * BSON wrappers should be rendered as terminal values with badges, not generic expandable objects.
 */
export function isBsonObject(value: any): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    "$oid" in value ||
    "$date" in value ||
    "$numberLong" in value ||
    "$numberDecimal" in value ||
    "$numberInt" in value ||
    "$numberDouble" in value ||
    "$binary" in value ||
    "$timestamp" in value ||
    "$regex" in value ||
    "$undefined" in value
  );
}

/**
 * Counts total expandable objects/arrays in a data structure up to a limit.
 */
export function countExpandableNodes(value: any, depth = 0, maxCount = 1000): number {
  if (value === null || value === undefined || typeof value !== "object") return 0;
  if (isBsonObject(value)) return 0;

  let count = 1;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (count >= maxCount) break;
      count += countExpandableNodes(value[i], depth + 1, maxCount - count);
    }
  } else {
    for (const key of Object.keys(value)) {
      if (count >= maxCount) break;
      count += countExpandableNodes(value[key], depth + 1, maxCount - count);
    }
  }
  return count;
}

/**
 * Collects paths of expandable nodes up to maximum depth and node count.
 */
export function getAllExpandablePaths(
  value: any,
  path = "$",
  depth = 0,
  maxDepth = 15,
  maxNodes = 2000
): string[] {
  const paths: string[] = [];
  if (value === null || value === undefined || typeof value !== "object") return paths;
  if (isBsonObject(value)) return paths;

  paths.push(path);
  if (depth >= maxDepth || paths.length >= maxNodes) return paths;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (paths.length >= maxNodes) break;
      const childPaths = getAllExpandablePaths(
        value[i],
        `${path}[${i}]`,
        depth + 1,
        maxDepth,
        maxNodes - paths.length
      );
      paths.push(...childPaths);
    }
  } else {
    for (const key of Object.keys(value)) {
      if (paths.length >= maxNodes) break;
      const childPaths = getAllExpandablePaths(
        value[key],
        `${path}.${key}`,
        depth + 1,
        maxDepth,
        maxNodes - paths.length
      );
      paths.push(...childPaths);
    }
  }
  return paths;
}

interface MongoTreeNodeProps {
  nodeKey?: string | number;
  value: any;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}

const MongoTreeNode: React.FC<MongoTreeNodeProps> = ({
  nodeKey,
  value,
  path,
  depth,
  expandedPaths,
  onToggle,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    let textToCopy = "";
    if (typeof value === "string") {
      textToCopy = value;
    } else {
      textToCopy = JSON.stringify(value, null, 2);
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  // 1. Primitive or BSON terminal leaf
  const isBson = isBsonObject(value);
  const isComplex = value !== null && typeof value === "object" && !isBson;

  if (!isComplex) {
    const formatted = formatMongoValue(value);
    const keyLabel = nodeKey !== undefined ? (
      <span className="text-purple-600 dark:text-purple-400 font-medium select-text mr-1.5">
        {typeof nodeKey === "number" ? `[${nodeKey}]` : `${nodeKey}:`}
      </span>
    ) : null;

    let valueRender: React.ReactNode = null;

    if (value === null || value === undefined) {
      valueRender = <span className="text-muted-foreground italic">null</span>;
    } else if (typeof value === "boolean") {
      valueRender = (
        <span className="text-amber-600 dark:text-amber-400 font-semibold">
          {value ? "true" : "false"}
        </span>
      );
    } else if (typeof value === "number") {
      valueRender = (
        <span className="text-blue-600 dark:text-blue-400 font-mono">
          {value}
        </span>
      );
    } else if (typeof value === "string") {
      valueRender = (
        <span className="text-emerald-600 dark:text-emerald-400 font-mono break-all">
          "{value}"
        </span>
      );
    } else if (isBson) {
      valueRender = (
        <span className="inline-flex items-center gap-1.5 font-mono">
          <span className="text-foreground select-text break-all">{formatted.display}</span>
        </span>
      );
    }

    return (
      <div className="group flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted/40 text-xs font-mono select-none">
        <span className="w-4 shrink-0" /> {/* Spacer for alignment with chevrons */}
        {keyLabel}
        {formatted.badgeText && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1 py-0 h-4 border leading-none font-semibold",
              formatted.badgeColor || "bg-muted/60 text-muted-foreground border-border/50"
            )}
          >
            {formatted.badgeText}
          </Badge>
        )}
        <div className="flex-1 truncate select-text">{valueRender}</div>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Copy value"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  // 2. Complex Object or Array (Collapsible)
  const isArray = Array.isArray(value);
  const isExpanded = expandedPaths.has(path);
  const keys = isArray ? [] : Object.keys(value);
  const itemCount = isArray ? value.length : keys.length;
  const descriptor = isArray ? `[${itemCount}]` : `{${itemCount}}`;

  const keyLabel = nodeKey !== undefined ? (
    <span className="text-purple-600 dark:text-purple-400 font-medium select-text mr-1.5">
      {typeof nodeKey === "number" ? `[${nodeKey}]` : `${nodeKey}:`}
    </span>
  ) : null;

  return (
    <div className="text-xs font-mono">
      <div
        onClick={() => onToggle(path)}
        className="group flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted/50 cursor-pointer select-none"
      >
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          aria-label={isExpanded ? "Collapse node" : "Expand node"}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {keyLabel}

        <span className="text-muted-foreground text-[11px] font-sans">
          {descriptor}
        </span>

        {!isExpanded && (
          <span className="text-muted-foreground/60 text-[11px] italic truncate">
            {isArray ? `Array(${itemCount})` : `Object(${itemCount} keys)`}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Copy JSON"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Lazy rendering: Subtree is completely unmounted when collapsed */}
      {isExpanded && (
        <div className="pl-4 ml-2 border-l border-border/40 space-y-0.5">
          {isArray
            ? value.map((item, idx) => (
                <MongoTreeNode
                  key={idx}
                  nodeKey={idx}
                  value={item}
                  path={`${path}[${idx}]`}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                />
              ))
            : keys.map((k) => (
                <MongoTreeNode
                  key={k}
                  nodeKey={k}
                  value={value[k]}
                  path={`${path}.${k}`}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                />
              ))}
        </div>
      )}
    </div>
  );
};

export interface MongoTreeViewerProps {
  data: any;
  defaultExpandedDepth?: number;
  className?: string;
  showControls?: boolean;
}

export const MongoTreeViewer: React.FC<MongoTreeViewerProps> = ({
  data,
  defaultExpandedDepth = 1,
  className,
  showControls = true,
}) => {
  // Compute default paths to expand up to defaultExpandedDepth
  const initialExpanded = useMemo(() => {
    return new Set(getAllExpandablePaths(data, "$", 0, defaultExpandedDepth));
  }, [data, defaultExpandedDepth]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialExpanded);
  const [copiedAll, setCopiedAll] = useState(false);

  // Sync initial expansion when data changes
  React.useEffect(() => {
    setExpandedPaths(new Set(getAllExpandablePaths(data, "$", 0, defaultExpandedDepth)));
  }, [data, defaultExpandedDepth]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const totalCount = countExpandableNodes(data);
    let paths: string[] = [];

    if (totalCount > LARGE_TREE_NODE_LIMIT) {
      // Large tree safeguard: Cap expansion to depth 4 or safe limit
      paths = getAllExpandablePaths(
        data,
        "$",
        0,
        LARGE_TREE_DEPTH_LIMIT - 1,
        LARGE_TREE_NODE_LIMIT
      );
      toast.info(
        `Large document detected (${totalCount} nodes). Expanded first ${paths.length} nodes to protect performance.`
      );
    } else {
      paths = getAllExpandablePaths(data, "$", 0, 15, 2000);
    }

    setExpandedPaths(new Set(paths));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleCopyAll = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedAll(true);
    toast.success("Copied entire document to clipboard");
    setTimeout(() => setCopiedAll(false), 1500);
  }, [data]);

  if (data === undefined || data === null) {
    return (
      <div className={cn("p-4 text-xs text-muted-foreground font-mono", className)}>
        null
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-background", className)}>
      {showControls && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20 shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExpandAll}
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronsUpDown className="h-3 w-3" />
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCollapseAll}
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronsDownUp className="h-3 w-3" />
              Collapse All
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyAll}
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          >
            {copiedAll ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            Copy JSON
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        <MongoTreeNode
          value={data}
          path="$"
          depth={0}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
};
