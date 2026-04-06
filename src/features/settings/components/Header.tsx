export default function Header() {
    return (
        <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm">
            <div className="container mx-auto px-8 py-6">
                <div>
                    <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight first:mt-0">
                        Settings
                    </h2>
                    <p className="leading-5 not-first:mt-2">
                        Customize your app appearance
                    </p>
                </div>
            </div>
        </header>
    )
}
