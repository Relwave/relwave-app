import { Link } from 'react-router-dom'
import { Button } from '../ui/button'
import { ArrowLeft } from 'lucide-react'

interface SchemaExplorerHeaderProps {
    dbId: string;
    database: {
        name: string;
    };
}


const SchemaExplorerHeader = ({ dbId, database }: SchemaExplorerHeaderProps) => {
    return (
        <div><header className="border-b border-border/50 bg-card/50 backdrop-blur-xl px-6 py-4 shrink-0 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link to={`/${dbId}`}>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-accent transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Schema Explorer</h1>
                        <p className="text-sm text-muted-foreground">
                            {database.name} | Browse structure and metadata
                        </p>
                    </div>
                </div>
            </div>
        </header></div>
    )
}

export default SchemaExplorerHeader