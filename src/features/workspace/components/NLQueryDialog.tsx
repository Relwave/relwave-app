import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { aiService, NLSQLResponse } from "@/services/bridge/ai";
import { useAISettings } from "@/features/ai/hooks/useAISettings";
import { Sparkles, Loader2, Play } from "lucide-react";

interface NLQueryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  onApplySQL?: (sql: string) => void;
}

export const NLQueryDialog: React.FC<NLQueryDialogProps> = ({
  isOpen,
  onOpenChange,
  dbId,
  onApplySQL,
}) => {
  const [question, setQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<NLSQLResponse | null>(null);
  const { settings } = useAISettings();

  const handleGenerate = async () => {
    if (!question.trim()) {
      toast.error("Please enter a question.");
      return;
    }
    setIsGenerating(true);
    setResponse(null);

    try {
      const res = await aiService.naturalLanguageQuery({
        question,
        databaseId: dbId,
        settings,
        options: { autoExecute: true, maxRows: 100 },
      });
      console.log("NLQuery Response:", res);
      setResponse(res);
      if (res.error) {
        toast.error(res.explanation || "Failed to generate query");
      } else {
        toast.success("Query generated successfully");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplySQL = () => {
    if (response?.sql && onApplySQL) {
      onApplySQL(response.sql);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Natural Language to SQL
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            AI can make mistakes. Please verify the generated SQL before applying it to your
            workspace.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., Show me the top 5 users who placed the most orders last month."
            className="resize-none h-24"
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />

          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !question.trim()}
              className="w-32"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating
                </>
              ) : (
                "Generate SQL"
              )}
            </Button>
          </div>

          {response && (
            <div className="flex-1 rounded-md border p-4 bg-muted/20 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-4">
                {response.intent === "unclear" || response.error ? (
                  <div className="text-destructive font-medium">{response.explanation}</div>
                ) : (
                  <>
                    <div className="w-full">
                      <h4 className="text-sm font-semibold mb-2">Interpretation:</h4>
                      <p className="text-sm text-muted-foreground wrap-break-word whitespace-pre-wrap">
                        {response.explanation}
                      </p>
                    </div>

                    {response.sql && (
                      <div className="w-full">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-semibold">Generated SQL:</h4>
                          <Button size="sm" variant="outline" onClick={handleApplySQL}>
                            <Play className="w-4 h-4 mr-1" /> Use Query
                          </Button>
                        </div>
                        <pre className="p-3 bg-background rounded-md text-sm overflow-x-auto whitespace-pre-wrap break-all border font-mono">
                          {response.sql}
                        </pre>
                      </div>
                    )}

                    {response.interpretation && (
                      <div className="w-full mt-2">
                        <h4 className="text-sm font-semibold mb-1">Result Summary:</h4>
                        <p className="text-sm p-3 bg-muted/50 text-foreground rounded-md border border-border/50 wrap-break-word whitespace-pre-wrap">
                          {response.interpretation}
                        </p>
                      </div>
                    )}

                    {response.results && response.results.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">
                          Data Preview ({response.rowCount} rows):
                        </h4>
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                {Object.keys(response.results[0] as any).map((k) => (
                                  <th
                                    key={k}
                                    className="p-2 text-left font-medium border-b border-r last:border-r-0 border-border/50 whitespace-nowrap"
                                  >
                                    {k}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {response.results.slice(0, 5).map((row: any, i) => (
                                <tr key={i} className="border-t">
                                  {Object.values(row).map((val: any, j) => (
                                    <td
                                      key={j}
                                      className="p-2 border-r last:border-r-0 border-border/50 truncate max-w-50"
                                      title={String(val)}
                                    >
                                      {String(val)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {response.results.length > 5 && (
                            <div className="p-2 text-xs text-center text-muted-foreground bg-muted/50 border-t">
                              Showing first 5 rows
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
