import { Spinner } from "@/components/ui/spinner"

const BridgeNotInitLoader = () => {
    return (
        <div className="h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <Spinner className="h-8 w-8 mx-auto mb-4 text-primary" />
                <h2 className="text-base font-medium text-foreground mb-1">Initializing</h2>
                <p className="text-sm text-muted-foreground">Connecting to database bridge...</p>
            </div>
        </div>
    )
}

export default BridgeNotInitLoader