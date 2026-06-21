import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Clock3, TimerReset } from "lucide-react";

export function MetricCard({
    icon: Icon,
    label,
    value,
    detail,
    valueClassName,
    children,
}: {
    icon: typeof Activity;
    label: string;
    value: string;
    detail: string;
    valueClassName?: string;
    children?: React.ReactNode;
}) {
    return (
        <Card className="rounded-lg border-border/50 bg-card/65 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div className="space-y-1">
                    <CardDescription className="text-xs">{label}</CardDescription>
                    <CardTitle className={cn("text-2xl font-semibold tracking-tight", valueClassName)}>
                        {value}
                    </CardTitle>
                </div>
                <div className="rounded-md border border-border/50 bg-background/60 p-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {label === "Throughput" ? <TimerReset className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {detail}
                </div>
                {children}
            </CardContent>
        </Card>
    );
}
