import { Button } from '../ui/button'
import { AlertCircle } from 'lucide-react'

const BridgeFailed = () => {
    return (
        <div className="h-screen bg-background text-foreground flex items-center justify-center overflow-hidden">
            <div className="text-center max-w-md">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2 text-foreground">Bridge Connection Failed</h2>
                <p className="text-muted-foreground mb-4">
                    Could not connect to the database bridge. Please restart the application.
                </p>
                <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90">
                    Retry
                </Button>
            </div>
        </div>
    )
}

export default BridgeFailed