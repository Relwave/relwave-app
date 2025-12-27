import { DatabaseConnection } from '@/types/database'
import { Card, CardContent } from './ui/card'
import { Database, Activity, Table2, HardDrive, Layers } from 'lucide-react'

export interface StatsOverviewProps {
    databases: Array<DatabaseConnection>
    connectedCount: number
    totalTables: number | string
    totalSize: string
    totalRows: number
    statsLoading: boolean
}

const StatsOverview = ({ databases, connectedCount, totalTables, totalSize, statsLoading, totalRows }: StatsOverviewProps) => {
    const stats = [
        {
            id: 'total-connections',
            icon: Database,
            value: databases.length,
            label: 'Total Connections',
        },
        {
            id: 'active-connections',
            icon: Activity,
            value: connectedCount,
            label: 'Active',
        },
        {
            id: 'total-tables',
            icon: Table2,
            value: statsLoading ? "..." : totalTables,
            label: 'Tables',
        },
        {
            id: 'total-rows',
            icon: Layers,
            value: statsLoading ? "..." : totalRows.toLocaleString(),
            label: 'Total Rows',
        },
        {
            id: 'total-size',
            icon: HardDrive,
            value: statsLoading ? "..." : totalSize,
            label: 'Data Size',
        },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {stats.map((stat) => (
                <Card key={stat.id} className="bg-card border-border">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-muted">
                                <stat.icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-2xl font-semibold text-foreground tabular-nums">
                                    {stat.value}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {stat.label}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export { StatsOverview };