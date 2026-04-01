import { Spinner } from "@/components/ui/spinner"

const BridgeLoader = () => {
    return (
        <div className="h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <Spinner className="h-8 w-8 mx-auto mb-4 text-primary" />
            </div>
        </div>
    )
}

export default BridgeLoader