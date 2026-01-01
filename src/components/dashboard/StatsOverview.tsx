import { DatabaseConnection } from '@/types/database'
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
                <div key={stat.id} className="border border-border/20 rounded-lg bg-background p-3.5">
                    <div className="flex items-center gap-2.5">
                        <stat.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <div className="min-w-0">
                            <p className="text-xl font-semibold text-foreground tabular-nums">
                                {stat.value}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70 truncate">
                                {stat.label}
                            </p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export { StatsOverview };