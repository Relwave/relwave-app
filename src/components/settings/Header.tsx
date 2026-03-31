export default function Header() {
    return (
        <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm">
            <div className="container mx-auto px-8 py-6">
                <div>
                    <h1 className="text-2xl font-semibold">Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Customize your app appearance
                    </p>
                </div>
            </div>
        </header>
    )
}
