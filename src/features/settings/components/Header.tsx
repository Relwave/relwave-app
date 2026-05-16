export default function Header() {
    return (
        <header className="border-b border-border/30 bg-background/80 backdrop-blur-xl">
            <div className="container mx-auto px-8 py-6">
                <div>
                    <h2 className="scroll-m-20 pb-2 text-2xl font-semibold tracking-tight first:mt-0">
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
