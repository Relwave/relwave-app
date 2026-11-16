import React, { useCallback, useEffect, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Edge,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "@/features/er-diagram/components/TableNode";
import { transformMongoToER } from "../../adapters/mongoErAdapter";
import { useProjectERDiagram } from "@/features/project/hooks/useProjectQueries";
import { projectService } from "@/services/bridge/project";
import type { ERNode } from "@/features/project/types";
import type {
  MongoInferredRelationship,
  MongoRelationship,
} from "../../types/relationship";

const nodeTypes = {
  table: TableNode,
};

export interface MongoERDiagramViewProps {
  projectId?: string | null;
  collections: string[];
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  manual: MongoRelationship[];
  onSelectRelationship?: (rel: MongoInferredRelationship | MongoRelationship) => void;
}

export function MongoERDiagramViewContent({
  projectId,
  collections,
  inferred,
  confirmed,
  manual,
  onSelectRelationship,
}: MongoERDiagramViewProps) {
  const reactFlowInstance = useReactFlow();
  const { data: savedLayout } = useProjectERDiagram(projectId ?? undefined);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Compute and set nodes/edges when collections, relationships, or savedLayout change
  useEffect(() => {
    const layoutNodes = savedLayout?.nodes ?? null;
    const { nodes: newNodes, edges: newEdges } = transformMongoToER({
      collections,
      confirmed,
      inferred,
      manual,
      useDagreLayout: true,
      savedLayout: layoutNodes,
    });
    setNodes(newNodes);
    setEdges(newEdges);

    const timer = setTimeout(() => {
      if (savedLayout?.zoom != null && savedLayout?.panX != null && savedLayout?.panY != null) {
        reactFlowInstance?.setViewport({
          zoom: savedLayout.zoom,
          x: savedLayout.panX,
          y: savedLayout.panY,
        });
      } else {
        reactFlowInstance?.fitView({ padding: 0.2, duration: 300 });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [collections, confirmed, inferred, manual, savedLayout, reactFlowInstance, setNodes, setEdges]);

  // Debounced auto-save of ER node positions to project er.json
  const erSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLayoutDoneRef = useRef(false);

  // Mark initial layout application so initial mounting does not trigger an immediate save
  useEffect(() => {
    initialLayoutDoneRef.current = false;
    const id = setTimeout(() => {
      initialLayoutDoneRef.current = true;
    }, 800);
    return () => clearTimeout(id);
  }, [collections, confirmed, inferred, manual, savedLayout]);

  useEffect(() => {
    if (!projectId || !initialLayoutDoneRef.current || nodes.length === 0) return;

    if (erSaveTimerRef.current) clearTimeout(erSaveTimerRef.current);

    erSaveTimerRef.current = setTimeout(() => {
      const viewport = reactFlowInstance?.getViewport();
      const erNodes: ERNode[] = nodes.map((n) => ({
        tableId: n.id,
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? (n as any).measured?.width ?? undefined,
        height: n.height ?? (n as any).measured?.height ?? undefined,
      }));
      projectService
        .saveProjectERDiagram(projectId, {
          nodes: erNodes,
          zoom: viewport?.zoom,
          panX: viewport?.x,
          panY: viewport?.y,
        })
        .then(() => console.debug("[ProjectSync] Mongo ER diagram saved"))
        .catch((err) => console.warn("[ProjectSync] Mongo ER diagram save failed:", err.message));
    }, 2000);

    return () => {
      if (erSaveTimerRef.current) clearTimeout(erSaveTimerRef.current);
    };
  }, [nodes, projectId, reactFlowInstance]);

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (edge.data?.relationship && onSelectRelationship) {
        onSelectRelationship(edge.data.relationship);
      }
    },
    [onSelectRelationship],
  );

  return (
    <div className="w-full h-full relative bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        fitView
        attributionPosition="bottom-right"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="bg-card border rounded-md overflow-hidden"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-card/90 backdrop-blur border p-2.5 rounded-lg text-xs space-y-1.5 shadow-md">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
            Relationship Types
          </span>
          {savedLayout && (
            <span className="text-[10px] text-muted-foreground/60 font-mono">Layout saved</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#10b981]" />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 border-t-2 border-dashed border-[#06b6d4]" />
          <span>Inferred</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#8b5cf6]" />
          <span>Manual</span>
        </div>
      </div>
    </div>
  );
}

export function MongoERDiagramView(props: MongoERDiagramViewProps) {
  return (
    <ReactFlowProvider>
      <MongoERDiagramViewContent {...props} />
    </ReactFlowProvider>
  );
}
