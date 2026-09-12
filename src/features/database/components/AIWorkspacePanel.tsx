import { Sparkles, Terminal, Search, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AIHistoryPanel from "@/features/ai/components/AIHistoryPanel";
import { PanelType } from "@/components/layout/VerticalIconBar";

interface AIWorkspacePanelProps {
  dbId: string;
  onNavigate: (panel: PanelType) => void;
}

export default function AIWorkspacePanel({ dbId, onNavigate }: AIWorkspacePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background p-6 gap-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Workspace
        </h1>
        <p className="text-muted-foreground text-sm">
          Central hub for AI-powered features for this database. Use the tools below to analyze
          data, build queries, and explore your schema using natural language.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Note: AI can make mistakes. Please verify responses and generated queries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card hover:bg-accent/5 transition-colors border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-500" />
              Natural Language to SQL
            </CardTitle>
            <CardDescription className="text-xs">
              Write database queries using plain English sentences. Let AI generate the SQL for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="secondary"
              className="w-full text-xs"
              onClick={() => onNavigate("sql-workspace")}
            >
              Launch NL Query
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card hover:bg-accent/5 transition-colors border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-500" />
              Schema Analysis
            </CardTitle>
            <CardDescription className="text-xs">
              Generate AI documentation and summaries for your entire database schema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="secondary"
              className="w-full text-xs"
              onClick={() => onNavigate("schema-explorer")}
            >
              Go to Schema Explorer
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card hover:bg-accent/5 transition-colors border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-500" />
              Query Explanation
            </CardTitle>
            <CardDescription className="text-xs">
              Highlight any complex SQL query in the workspace and let AI explain what it does
              step-by-step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="secondary"
              className="w-full text-xs"
              onClick={() => onNavigate("sql-workspace")}
            >
              Open SQL Workspace
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 mt-4">
        {/* Pass dbId so it strictly filters for this DB and hides the Global DB column */}
        <AIHistoryPanel dbId={dbId} />
      </div>
    </div>
  );
}
