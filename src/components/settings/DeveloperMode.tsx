import { Bug, Code2 } from 'lucide-react'
import React from 'react'
import { Switch } from '../ui/switch'
import { useDeveloperMode } from '@/hooks/useDeveloperMode';

export default function DeveloperMode() {
    const { isEnabled: devModeEnabled, setIsEnabled: setDevModeEnabled } = useDeveloperMode();
    return (
        <section className="border border-border/20 rounded-lg p-6 bg-background">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Code2 className="h-4 w-4 text-muted-foreground/60" />
                    <div>
                        <h2 className="text-sm font-medium">Developer Mode</h2>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                            Enable developer tools and context menu options
                        </p>
                    </div>
                </div>
                <Switch
                    checked={devModeEnabled}
                    onCheckedChange={setDevModeEnabled}
                />
            </div>

            {devModeEnabled && (
                <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/20">
                    <div className="flex items-start gap-2">
                        <Bug className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="text-xs text-muted-foreground">
                            <p className="font-medium text-foreground mb-1">Developer features enabled:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                <li>Right-click context menu with Inspect, Reload, Back/Forward</li>
                                <li>Access to browser developer tools (F12)</li>
                                <li>Keyboard shortcuts for navigation</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}
