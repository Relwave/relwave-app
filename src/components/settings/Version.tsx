import { getVersion } from '@tauri-apps/api/app';
import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function Version() {

    const [appVersion, setAppVersion] = useState<string>("");

    useEffect(() => {
        getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
    }, []);
    return (
        <section className="border border-border/20 rounded-lg p-6 bg-background">
            <div className="flex items-center gap-2.5">
                <Info className="h-4 w-4 text-muted-foreground/60" />
                <div>
                    <h2 className="text-sm font-medium">About</h2>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                        RelWave v{appVersion || "—"}
                    </p>
                </div>
            </div>
        </section>
    )
}
