import { Link } from 'react-router-dom'
import { Button } from '../ui/button'
import { ArrowLeft } from 'lucide-react'

const Header = ({ id }: { id: string }) => {
    return (
        <header className="border-b bg-card/50 backdrop-blur">
            <div className="container mx-auto px-4 py-4">
                <div className="flex items-center gap-4">
                    <Link to={`/${id}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Visual Query Builder</h1>
                        <p className="text-sm text-muted-foreground">Build queries visually for {id}</p>
                    </div>
                </div>
            </div>
        </header>)
}

export default Header