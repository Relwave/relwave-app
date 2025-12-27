import { Button } from '../ui/button'
import { AlertCircle } from 'lucide-react'

const BridgeFailed = () => {
    return (
        <div className="h-screen bg-background flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-base font-medium text-foreground mb-1">Connection Failed</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Unable to connect to the database bridge.
                </p>
                <Button onClick={() => window.location.reload()} size="sm">
                    Retry
                </Button>
            </div>
        </div>
    )
}

export default BridgeFailed