import { Spinner } from "@/components/ui/spinner"
const BridgeNotInitLoader = () => {
    return (
        <div className="h-screen bg-background text-foreground flex items-center justify-center overflow-hidden">
            <div className="text-center">
                <Spinner className="size-16" />
                <h2 className="text-xl font-semibold mb-2 text-foreground">Initializing Database Bridge</h2>
                <p className="text-muted-foreground">Please wait while we connect to the bridge...</p>
            </div>
        </div>
    )
}

export default BridgeNotInitLoader