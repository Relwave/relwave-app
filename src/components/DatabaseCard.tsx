import { Link } from "react-router-dom";
import { Database, Table2, HardDrive, Activity, Trash2, TestTube, MoreVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface DatabaseCardProps {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected";
  tables: number;
  size: string;
  host: string;
  onDelete?: () => void;
  onTest?: () => void;
}

export const DatabaseCard = ({ 
  id, 
  name, 
  type, 
  status, 
  tables, 
  size, 
  host,
  onDelete,
  onTest 
}: DatabaseCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Dynamic colors based on status
  const isConnected = status === "connected";
  const statusColorClass = isConnected 
    ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/50"
    : "bg-red-600/20 text-red-300 border-red-500/50";
  
  const iconColor = isConnected ? "text-cyan-400" : "text-red-400";
  const hoverGlow = isConnected ? "hover:border-cyan-500/80" : "hover:border-red-500/80";

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleTest = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTest?.();
  };

  const confirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  return (
    <>
      <Card 
        className={`bg-gray-900/70 border border-primary/20 rounded-xl shadow-2xl 
                  transition-all duration-300 cursor-pointer h-full 
                  group ${hoverGlow} hover:bg-gray-800/80 relative`}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            {/* Database Info - Clickable Link */}
            <Link to={`/${id}`} className="flex items-center gap-4 min-w-0 flex-shrink pr-2 flex-1">
              <div 
                className={`p-3 rounded-xl transition-colors flex-shrink-0 
                  ${isConnected ? "bg-cyan-600/30" : "bg-red-600/30"}`}
              >
                <Database className={`h-6 w-6 ${iconColor}`} />
              </div>
              <div className="truncate min-w-0"> 
                <CardTitle className="text-xl mb-1 text-white group-hover:text-cyan-400 transition-colors truncate">
                  {name}
                </CardTitle>
                <CardDescription className="font-mono text-xs text-gray-500 truncate">
                  {host}
                </CardDescription>
              </div>
            </Link>
            
            {/* Actions Menu */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant="outline"
                className={`flex items-center gap-1 font-semibold uppercase px-3 py-1 ${statusColorClass}`}
              >
                <Activity className={`h-3 w-3 mr-1 ${isConnected ? "animate-pulse" : ""}`} />
                {status}
              </Badge>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="bg-gray-900 border-gray-700 text-white"
                >
                  <DropdownMenuItem 
                    onClick={handleTest}
                    className="cursor-pointer hover:bg-gray-800 focus:bg-gray-800"
                  >
                    <TestTube className="h-4 w-4 mr-2 text-cyan-400" />
                    Test Connection
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    className="cursor-pointer hover:bg-red-900/20 focus:bg-red-900/20 text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Connection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        
        <Link to={`/${id}`}>
          <CardContent>
            <div className="space-y-4 pt-2">
              
              {/* Database Type */}
              <div className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-400">Database Engine</span>
                <span className="font-mono font-medium text-white px-2 py-0.5 rounded-md bg-gray-800/70">
                  {type}
                </span>
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
        </Link>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Delete Database Connection?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete <span className="font-semibold text-white">{name}</span>? 
              This action cannot be undone. The connection configuration will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};