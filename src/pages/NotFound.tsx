import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background px-4">
            <div className="text-center">
                <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
                <p className="text-muted-foreground mb-6">Page not found</p>
                <Button asChild>
                    <Link to="/">Go Home</Link>
                </Button>
            </div>
        </div>
    )
}