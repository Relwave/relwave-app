import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Loader2, Play, RefreshCw, X } from 'lucide-react'
import { Textarea } from '../ui/textarea'
import { DataTable } from '../DataTable'
import { QueryProgress } from '@/pages/DatabaseDetails'
import { TableRow } from '@/services/bridgeApi'



interface EditorProps {
    isExecuting: boolean;
    rowCount: number;
    query: string;
    accentButtonClass: string;
    accentClass: string;
    tableData: TableRow[];
    queryProgress: QueryProgress | null;
    setQuery: (q: string) => void;
    onExecuteQuery: () => void;
    onCancelQuery: () => void;
}

const Editor = ({
    isExecuting,
    rowCount,
    query,
    queryProgress,
    accentButtonClass,
    accentClass,
    tableData,
    setQuery,
    onExecuteQuery,
    onCancelQuery,
}: EditorProps) => {
    return (
        <>
            <Card className="bg-card border border-border rounded-xl shadow-elevated">
                <CardHeader className="border-b border-border pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl text-foreground">SQL Query Editor</CardTitle>
                        <div className="flex items-center space-x-3">
                            {isExecuting && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={onCancelQuery}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    <X className="h-4 w-4 mr-2" />
                                    Cancel
                                </Button>
                            )}
                            <Button
                                onClick={onExecuteQuery}
                                disabled={isExecuting || !query.trim()}
                                // Primary button color
                                className={`${accentButtonClass} transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isExecuting ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Executing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Execute Query
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    <Textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={isExecuting}
                        className="font-mono text-sm min-h-[250px] resize-y 
                                         bg-muted border-input text-foreground dark:bg-background/50
                                         focus:border-primary transition-colors placeholder:text-muted-foreground/80 p-4
                                         disabled:opacity-80 disabled:cursor-text"
                        placeholder="Enter your SQL query (e.g., SELECT * FROM users WHERE role = 'Admin');"
                    />
                </CardContent>
            </Card>

            {/* Query Results Section - Card background updated */}
            <Card className="bg-card border border-border rounded-xl shadow-elevated">
                <CardHeader className="border-b border-border pb-4">
                    <CardTitle className="font-mono text-xl text-foreground">Query Results</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        {isExecuting
                            ? `Fetching results... (${rowCount.toLocaleString()} rows so far)`
                            : `Displaying ${rowCount.toLocaleString()} rows`
                        }
                        {queryProgress && (
                            <span className={`ml-2 text-xs font-semibold ${accentClass}`}>
                                | Elapsed: {queryProgress.elapsed}s
                            </span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    {isExecuting && rowCount === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                            Awaiting first results batch...
                        </div>
                    ) : (
                        <DataTable data={tableData} />
                    )}
                </CardContent>
            </Card>
        </>
    )
}

export default Editor