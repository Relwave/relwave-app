import { Button } from '../../../components/ui/button'

export default function Preview() {
    return (
        <section className="border border-border/50 rounded-lg p-6 bg-card/65 shadow-sm backdrop-blur-sm">
            <h2 className="text-sm font-medium mb-4">Preview</h2>
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Button size="sm" className="text-xs">
                        Primary Button
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs">
                        Outline Button
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs">
                        Ghost Button
                    </Button>
                </div>
                <div className="p-3 border border-border/40 rounded-md bg-background/45">
                    <p className="text-sm text-muted-foreground">
                        This is a preview of how text and UI elements will look with your selected theme.
                    </p>
                </div>
            </div>
        </section>
    )
}
