import React, { useState, useMemo } from "react";
import { Plus, Database, Search, Trash2, Zap, Folder, ChevronRight, ChevronDown, MoreVertical, Edit2, FolderPlus, GripVertical, FolderMinus, Shield, FolderInput, X, Settings as SettingsIcon, CircleDot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConnectionListProps } from "../types";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { useConnectionGroups, ConnectionGroup } from "../hooks/useConnectionGroups";
import { 
  DndContext, 
  DragOverlay, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { 
  useSortable, 
  SortableContext, 
  verticalListSortingStrategy 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DatabaseConnection } from "@/features/database/types";
import { InputDialog } from "@/components/shared/InputDialog";
import { SettingsDialog } from "@/features/settings/components";
import { UnlinkedProjectItem } from "@/features/project/components/UnlinkedProjectItem";

// --- Components ---

function DraggableConnectionItem({ 
  db, 
  isConnected, 
  isSelected, 
  isInGroup,
  onClick, 
  onHover, 
  onDelete, 
  onTest,
  onRemoveFromGroup
}: { 
  db: DatabaseConnection;
  isConnected: boolean;
  isSelected: boolean;
  isInGroup: boolean;
  onClick: () => void;
  onHover: () => void;
  onDelete: (id: string, name: string) => void;
  onTest: (id: string, name: string) => void;
  onRemoveFromGroup?: (id: string) => void;
}) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition,
    isDragging 
  } = useSortable({
    id: db.id,
    data: {
        type: 'connection',
        db
    }
  });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const menuItems = (
    <>
        <DropdownMenuItem onClick={() => onTest(db.id, db.name)} className="gap-2">
            <Zap className="h-4 w-4" />
            Test Connection
        </DropdownMenuItem>
        {isInGroup && onRemoveFromGroup && (
            <DropdownMenuItem onClick={() => onRemoveFromGroup(db.id)} className="gap-2">
                <FolderMinus className="h-4 w-4" />
                Remove from Group
            </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(db.id, db.name)} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" />
            Remove from Project
        </DropdownMenuItem>
    </>
  );

  return (
    <div ref={setNodeRef} style={style} className="touch-none group/item relative">
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    onClick={onClick}
                    onMouseEnter={onHover}
                    className={cn(
                    "w-full flex items-center gap-2 px-1 py-2 rounded-md text-left transition-all duration-150 border border-transparent cursor-pointer",
                    isSelected
                        ? "bg-accent/85 text-accent-foreground border-primary/20 shadow-sm"
                        : "hover:bg-accent/45 hover:border-border/60",
                    !isConnected && "opacity-50"
                    )}
                >
                    <div {...attributes} {...listeners} className="p-1 hover:bg-muted rounded opacity-0 group-hover/item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                    <div
                    className={cn(
                        "h-2 w-2 rounded-full shrink-0 ring-4",
                        isConnected ? "bg-emerald-500 ring-emerald-500/10 motion-safe:animate-pulse" : "bg-muted-foreground/30 ring-muted/40"
                    )}
                    />
                    <div className="flex-1 min-w-0 pr-6 ml-1">
                        <p className="text-sm font-medium truncate">{db.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono flex items-center gap-1">
                            {db.type} • {db.type === "sqlite" ? db.database : db.host}
                            {db.ssh && (
                                <Shield className="h-2.5 w-2.5 text-blue-400 shrink-0" aria-label="SSH tunnel" />
                            )}
                        </p>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={() => onTest(db.id, db.name)} className="gap-2">
                    <Zap className="h-4 w-4" />
                    Test Connection
                </ContextMenuItem>
                {isInGroup && onRemoveFromGroup && (
                    <ContextMenuItem onClick={() => onRemoveFromGroup(db.id)} className="gap-2">
                        <FolderMinus className="h-4 w-4" />
                        Remove from Group
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onDelete(db.id, db.name)} className="gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Remove from Project
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>

        {/* Inline Actions Dropdown */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {menuItems}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </div>
  );
}

function DroppableGroup({ 
    group, 
    connections, 
    onToggle, 
    onRenameClick, 
    onDelete,
    selectedDb,
    setSelectedDb,
    onDatabaseHover,
    onDeleteDb,
    onTestDb,
    onRemoveFromGroup,
    status
}: { 
    group: ConnectionGroup;
    connections: DatabaseConnection[];
    onToggle: (id: string) => void;
    onRenameClick: (group: ConnectionGroup) => void;
    onDelete: (id: string) => void;
    selectedDb: string | null;
    setSelectedDb: (id: string | null) => void;
    onDatabaseHover: (dbId: string) => void;
    onDeleteDb: (dbId: string, dbName: string) => void;
    onTestDb: (dbId: string, dbName: string) => void;
    onRemoveFromGroup: (id: string) => void;
    status: Map<string, string>;
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: group.id,
        data: {
            type: 'group',
            groupId: group.id
        }
    });

    return (
        <div ref={setNodeRef} className={cn(
            "rounded-lg mb-2 transition-colors border border-transparent pb-1",
            isOver ? "bg-primary/5 border-primary/20 shadow-inner" : ""
        )}>
            <div className="flex items-center group/header px-2 py-1.5">
                <button 
                    onClick={() => onToggle(group.id)}
                    className="p-1 hover:bg-accent rounded mr-1"
                >
                    {group.isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <Folder className="h-3.5 w-3.5 mr-2 text-primary/70" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 flex-1 truncate">
                    {group.name}
                </span>
                <span className="text-[10px] text-muted-foreground/40 mr-2 font-mono">
                    {connections.length}
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/header:opacity-100">
                            <MoreVertical className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onRenameClick(group)}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Rename Group
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(group.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Group
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {!group.isCollapsed && (
                <div className="space-y-0.5 px-1">
                    <SortableContext items={connections.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {connections.length === 0 ? (
                            <div className="py-4 text-center text-[10px] text-muted-foreground/40 italic">
                                Empty — drag here
                            </div>
                        ) : (
                            connections.map(db => (
                                <DraggableConnectionItem
                                    key={db.id}
                                    db={db}
                                    isConnected={status.get(db.id) === "connected"}
                                    isSelected={selectedDb === db.id}
                                    isInGroup={true}
                                    onClick={() => setSelectedDb(db.id)}
                                    onHover={() => onDatabaseHover(db.id)}
                                    onDelete={onDeleteDb}
                                    onTest={onTestDb}
                                    onRemoveFromGroup={onRemoveFromGroup}
                                />
                            ))
                        )}
                    </SortableContext>
                </div>
            )}
        </div>
    );
}

// --- Main Component ---

export function ConnectionList({ 
  databases, 
  filteredDatabases, 
  unlinkedProjects = [],
  loading, 
  searchQuery, 
  setSearchQuery, 
  onlineFilter, 
  setOnlineFilter, 
  selectedDb, 
  setSelectedDb, 
  status, 
  connectedCount, 
  totalTables, 
  statsLoading,
  onAddClick,
  onDatabaseHover,
  onDelete,
  onTest,
  onImportClick
}: ConnectionListProps) {
  const { 
    groups, 
    ungroupedIds, 
    addGroup, 
    deleteGroup, 
    renameGroup, 
    toggleGroupCollapse, 
    moveConnection,
    removeFromGroup
  } = useConnectionGroups(databases.map(db => db.id));

  const [activeId, setActiveId] = useState<string | null>(null);

  // Dialog states
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [groupToRename, setGroupToRename] = useState<ConnectionGroup | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over) {
        moveConnection(active.id as string, over.id as string);
    }
  };

  const { isOver: isOverUngrouped, setNodeRef: setUngroupedRef } = useDroppable({
    id: 'ungrouped',
    data: { type: 'ungrouped' }
  });

  const filteredDatabasesById = useMemo(() => {
    const map = new Map<string, DatabaseConnection>();
    filteredDatabases.forEach(db => map.set(db.id, db));
    return map;
  }, [filteredDatabases]);

  const ungroupedConnections = useMemo(() => {
    return ungroupedIds.map(id => filteredDatabasesById.get(id)).filter(Boolean) as DatabaseConnection[];
  }, [ungroupedIds, filteredDatabasesById]);

  return (
    <div className="w-78 border-r border-border/50 flex flex-col bg-card/55 backdrop-blur-xl h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-background/35">
        <div className="flex items-center justify-between mb-3">
          <h2 className="scroll-m-20 pb-1 text-xl font-semibold tracking-tight first:mt-0">
            Connections
          </h2>
          <div className="flex gap-1">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNewGroupOpen(true)}>
                            <FolderPlus className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>New Group</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {onImportClick && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onImportClick}>
                                <FolderInput className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p>Import Project</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onAddClick}
            >
                <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            id="connection-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-background/65 border-border/60 shadow-inner focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
      </div>
      
      {onlineFilter && (
        <div className="px-4 pb-3 pt-3 bg-background/35 border-b border-border/50">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium border border-emerald-500/20">
            <CircleDot className="h-3 w-3" />
            Filtered: Online only
            <button 
              onClick={() => setOnlineFilter(false)}
              className="ml-1 hover:text-emerald-700 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Database List */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : filteredDatabases.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {databases.length === 0 ? "No connections" : "No matches"}
            </p>
          </div>
        ) : (
          <div className="space-y-1 px-2 pb-12">
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                {/* Groups */}
                {groups.map(group => (
                    <DroppableGroup 
                        key={group.id} 
                        group={group}
                        connections={group.connectionIds.map(id => filteredDatabasesById.get(id)).filter(Boolean) as DatabaseConnection[]}
                        onToggle={toggleGroupCollapse}
                        onRenameClick={(g) => {
                            setGroupToRename(g);
                            setRenameGroupOpen(true);
                        }}
                        onDelete={deleteGroup}
                        selectedDb={selectedDb}
                        setSelectedDb={setSelectedDb}
                        onDatabaseHover={onDatabaseHover}
                        onDeleteDb={onDelete}
                        onTestDb={onTest}
                        onRemoveFromGroup={removeFromGroup}
                        status={status}
                    />
                ))}

                {/* Ungrouped */}
                <div ref={setUngroupedRef} className={cn(
                    "mt-2 pt-2 border-t border-border/20 rounded-lg transition-colors border border-transparent min-h-20 pb-4",
                    isOverUngrouped ? "bg-primary/5 border-primary/20 shadow-inner" : ""
                )}>
                    {groups.length > 0 && (
                        <div className="px-2 mb-2">
                            <span className="text-xs text-muted-foreground/50 lowercase">
                                ungrouped
                            </span>
                        </div>
                    )}
                    <div className="space-y-0.5">
                        <SortableContext items={ungroupedConnections.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            {ungroupedConnections.map(db => (
                                <DraggableConnectionItem
                                    key={db.id}
                                    db={db}
                                    isConnected={status.get(db.id) === "connected"}
                                    isSelected={selectedDb === db.id}
                                    isInGroup={false}
                                    onClick={() => setSelectedDb(db.id)}
                                    onHover={() => onDatabaseHover(db.id)}
                                    onDelete={onDelete}
                                    onTest={onTest}
                                />
                            ))}
                        </SortableContext>
                    </div>
                </div>

                {/* Unlinked Projects Section */}
                {unlinkedProjects && unlinkedProjects.length > 0 && (
                    <div className="mt-4 pt-2 border-t border-border/20 rounded-lg">
                        <div className="px-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                                unlinked projects
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            {unlinkedProjects.map((project) => (
                                <UnlinkedProjectItem 
                                    key={project.id} 
                                    project={project}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <DragOverlay dropAnimation={{
                    sideEffects: defaultDropAnimationSideEffects({
                        styles: {
                            active: {
                                opacity: '0.3',
                            },
                        },
                    }),
                }}>
                    {activeId ? (
                        <div className="opacity-90 scale-[1.02] pointer-events-none transition-transform duration-200">
                             <div className="flex items-center gap-2 px-3 py-2 bg-sidebar border border-primary/40 shadow-2xl rounded-md min-w-56 backdrop-blur-xl ring-1 ring-white/5">
                                <GripVertical className="h-3 w-3 text-primary/50" />
                                <div className={cn(
                                    "h-2 w-2 rounded-full ring-2",
                                    status.get(activeId) === "connected" ? "bg-emerald-500 ring-emerald-500/20 motion-safe:animate-pulse" : "bg-muted-foreground/30 ring-muted/20"
                                )} />
                                <span className="text-sm font-semibold truncate text-foreground">{filteredDatabasesById.get(activeId)?.name}</span>
                             </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
          </div>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="p-3 border-t border-border/50 bg-background/55">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Card className="text-center p-2 rounded-md premium-card shadow-sm">
            <CardContent className="px-2 pb-0">
              <CardTitle className="text-lg font-bold tabular-nums font-mono leading-none mb-1">
                {connectedCount}/{databases.length}
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight text-center">Online</CardDescription>
            </CardContent>
          </Card>
          <Card className="text-center p-2 rounded-md premium-card shadow-sm">
            <CardContent className="px-2 pb-0">
              <CardTitle className="text-lg font-bold tabular-nums font-mono leading-none mb-1 text-center">
                {statsLoading ? <Spinner className="mx-auto" /> : totalTables}
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight text-center">Tables</CardDescription>
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                <SettingsIcon className="h-4 w-4" />
            </Button>
        </div>
      </div>

      {/* Dialogs */}
      <InputDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        title="New Connection Group"
        description="Create a folder to organize your database connections."
        placeholder="Group Name (e.g. Production)"
        confirmLabel="Create Group"
        onConfirm={addGroup}
      />

      {groupToRename && (
        <InputDialog
            open={renameGroupOpen}
            onOpenChange={setRenameGroupOpen}
            title="Rename Group"
            defaultValue={groupToRename.name}
            confirmLabel="Save"
            onConfirm={(name) => renameGroup(groupToRename.id, name)}
        />
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
