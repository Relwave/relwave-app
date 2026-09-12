import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DatabaseErrorViewProps {
  error: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export const DatabaseErrorView = ({ error, isRetrying, onRetry }: DatabaseErrorViewProps) => (
  <div className="h-[calc(100vh-32px)] flex items-center justify-center bg-background text-foreground">
    <Card className="max-w-md w-full mx-4 border-border/20">
      <CardHeader className="border-b border-border/20">
        <CardTitle className="text-base">Connection Error</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-sm text-muted-foreground/70 mb-3">Failed to connect to the database:</p>
        <pre className="bg-muted/30 text-destructive p-3 rounded-md text-xs font-mono overflow-auto border border-border/20">
          {error}
        </pre>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={onRetry} disabled={isRetrying} className="text-xs">
            {isRetrying ? (
              <>
                <Spinner className="h-3.5 w-3.5 mr-1.5" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);
