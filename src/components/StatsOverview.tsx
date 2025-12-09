import { DatabaseConnection } from '@/services/bridgeApi'
import { Card, CardContent } from './ui/card'
import { Database } from 'lucide-react'


export interface StatsOverviewProps {
    databases: Array<DatabaseConnection>
    connectedCount: number
    totalTables: number | string
    totalSize: string
    totalRows: number
    statsLoading: boolean
}

const StatsOverview = ({ databases, connectedCount, totalTables, totalSize, statsLoading, totalRows }: StatsOverviewProps) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {/* Card 1: Total Connections (Cyan) */}
            <Card className="shadow-elevated hover:border-cyan-500/50 transition-all duration-300">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/20 rounded-xl">
                            <Database className="h-6 w-6 text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-foreground">{databases.length}</p>
                            <p className="text-sm text-muted-foreground">Total Connections</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 2: Active Connections (Emerald) */}
            <Card className="shadow-elevated hover:border-emerald-500/50 transition-all duration-300">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl">
                            <Database className="h-6 w-6 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-foreground">{connectedCount}</p>
                            <p className="text-sm text-muted-foreground">Active Connections</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 3: Total Tables (Violet) */}
            <Card className="shadow-elevated hover:border-violet-500/50 transition-all duration-300">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-violet-500/20 rounded-xl">
                            <Database className="h-6 w-6 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-foreground">
                                {statsLoading ? "..." : totalTables}
                            </p>
                            <p className="text-sm text-muted-foreground">Total Schemas/Tables</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-elevated hover:border-violet-500/50 transition-all duration-300">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-violet-500/20 rounded-xl">
                            <Database className="h-6 w-6 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-foreground">
                                {statsLoading ? "..." : totalRows}
                            </p>
                            <p className="text-sm text-muted-foreground">Total Rows</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Card 4: Total Data Size (Amber) */}
            <Card className="shadow-elevated hover:border-amber-500/50 transition-all duration-300">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/20 rounded-xl">
                            <Database className="h-6 w-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-foreground">
                                {statsLoading ? "..." : totalSize}
                            </p>
                            <p className="text-sm text-muted-foreground">Total Data Size</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default StatsOverview