import { Link } from "react-router-dom";
import { Database, Table2, HardDrive, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DatabaseCardProps {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected";
  tables: number;
  size: string;
  host: string;
}

export const DatabaseCard = ({ id, name, type, status, tables, size, host }: DatabaseCardProps) => {
  
  // Dynamic colors based on status
  const isConnected = status === "connected";
  const statusColorClass = isConnected 
    ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/50" // Connected (Vibrant Green)
    : "bg-red-600/20 text-red-300 border-red-500/50";           // Disconnected (Vibrant Red)
  
  const iconColor = isConnected ? "text-cyan-400" : "text-red-400";
  const hoverGlow = isConnected ? "hover:border-cyan-500/80" : "hover:border-red-500/80";

  return (
    <Link to={`/${id}`}>
      {/* Enhanced Card Styling: Dark background, vibrant hover/glow */}
      <Card 
        className={`bg-gray-900/70 border border-primary/20 rounded-xl shadow-2xl 
                  transition-all duration-300 cursor-pointer h-full 
                  group ${hoverGlow} hover:bg-gray-800/80`}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            {/* FIX: Wrap the entire database details (icon + name/host) in a container 
              with 'min-w-0' and 'flex-shrink' to ensure the text can truncate 
              instead of pushing the badge out. 
            */}
            <div className="flex items-center gap-4 min-w-0 flex-shrink pr-2"> 
              {/* Icon Container: Ensure icon itself doesn't shrink */}
              <div 
                className={`p-3 rounded-xl transition-colors flex-shrink-0 
                  ${isConnected ? "bg-cyan-600/30" : "bg-red-600/30"}`}
              >
                <Database className={`h-6 w-6 ${iconColor}`} />
              </div>
              {/* Name/Host Container: Allows text to be truncated if needed */}
              <div className="truncate min-w-0"> 
                <CardTitle className="text-xl mb-1 text-white group-hover:text-cyan-400 transition-colors truncate">
                  {name}
                </CardTitle>
                <CardDescription className="font-mono text-xs text-gray-500 truncate">
                  {host}
                </CardDescription>
              </div>
            </div>
            
            {/* Status Badge: Ensure the badge container itself doesn't shrink. */}
            <Badge
              variant="outline"
              className={`flex items-center gap-1 font-semibold uppercase px-3 py-1 flex-shrink-0 ${statusColorClass}`}
            >
              <Activity className={`h-3 w-3 mr-1 ${isConnected ? "animate-pulse" : ""}`} />
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 pt-2">
            
            {/* Database Type */}
            <div className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
              <span className="text-gray-400">Database Engine</span>
              <span className="font-mono font-medium text-white px-2 py-0.5 rounded-md bg-gray-800/70">{type}</span>
            </div>
            
            {/* Tables Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-2">
                <Table2 className="h-4 w-4 text-violet-400" /> 
                Total Tables
              </span>
              <span className="font-mono font-medium text-lg text-white">{tables}</span>
            </div>
            
            {/* Size */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-amber-400" /> 
                Storage Used
              </span>
              <span className="font-mono font-medium text-lg text-white">{size}</span>
            </div>
            
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};