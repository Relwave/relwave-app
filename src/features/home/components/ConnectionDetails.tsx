import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatabaseConnection } from "@/features/database/types"

export function ConnectionDetails({ database }: { database: DatabaseConnection }) {
    return (
        <Card className="@container/card">
            <CardHeader className="px-4 py-2 border-b border-border/50">
                <CardTitle className="scroll-m-20 text-xl font-semibold tracking-tight">
                    Connection Details
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
                {database.type !== "sqlite" && (
                    <>
                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">Host</span>
                            <span className="text-sm font-mono">{database.host}</span>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">Port</span>
                            <span className="text-sm font-mono">{database.port}</span>
                        </div>
                    </>
                )}

                <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-sm text-muted-foreground">
                        {database.type === "sqlite" ? "File" : "Database"}
                    </span>
                    <span className="text-sm font-mono">{database.database}</span>
                </div>

                {database.type !== "sqlite" && (
                    <div className="flex items-center justify-between py-2 border-b border-border/30">
                        <span className="text-sm text-muted-foreground">User</span>
                        <span className="text-sm font-mono">{database.user}</span>
                    </div>
                )}

                <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Created</span>
                    <span className="text-sm">
                        {new Date(database.createdAt).toLocaleDateString()}
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}