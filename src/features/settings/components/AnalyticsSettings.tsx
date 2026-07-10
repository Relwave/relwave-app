import { useEffect, useState } from "react";
import { analyticsService } from "@/services/analytics";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Info } from "lucide-react";

export default function AnalyticsSettings() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        analyticsService.isEnabled().then((val) => {
            setEnabled(val);
            setLoading(false);
        });
    }, []);

    const handleToggle = async (checked: boolean) => {
        setEnabled(checked);
        await analyticsService.setEnabled(checked);
    };

    if (loading) return null;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
                <h3 className="text-lg font-medium text-foreground tracking-tight">Privacy & Analytics</h3>
                <p className="text-sm text-muted-foreground mt-1.5">
                    Manage how anonymous usage data is collected.
                </p>
            </div>

            <div className="space-y-6 bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="analytics-toggle" className="text-base font-medium">
                            Enable Anonymous Analytics
                        </Label>
                        <p className="text-[13px] text-muted-foreground leading-relaxed max-w-[90%]">
                            Help us improve RelWave by sharing completely anonymous usage statistics. 
                            Analytics are <strong className="font-semibold text-foreground">disabled by default</strong> and strictly respect your privacy.
                        </p>
                    </div>
                    <Switch
                        id="analytics-toggle"
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        className="mt-1"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
                    <div className="flex gap-3 text-sm">
                        <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                        <div className="space-y-1">
                            <span className="font-medium block text-foreground">What we collect</span>
                            <ul className="text-muted-foreground text-[13px] list-disc list-inside space-y-1">
                                <li>App launches & updates</li>
                                <li>Database driver types (e.g. Postgres)</li>
                                <li>Feature usage (e.g. "Query Executed")</li>
                                <li>Operating System (Windows/Mac/Linux)</li>
                            </ul>
                        </div>
                    </div>
                    <div className="flex gap-3 text-sm">
                        <ShieldAlert className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                        <div className="space-y-1">
                            <span className="font-medium block text-foreground">What we NEVER collect</span>
                            <ul className="text-muted-foreground text-[13px] list-disc list-inside space-y-1">
                                <li>SQL queries or schema data</li>
                                <li>Database credentials or hosts</li>
                                <li>Table/Column names</li>
                                <li>AI Prompts or Responses</li>
                                <li>Any PII or IPs</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
