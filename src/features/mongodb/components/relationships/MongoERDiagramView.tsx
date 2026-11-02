import React, { useMemo, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Edge,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "@/features/er-diagram/components/TableNode";
import { transformMongoToER } from "../../adapters/mongoErAdapter";
import type {
  MongoInferredRelationship,
  MongoRelationship,
} from "../../types/relationship";

const nodeTypes = {
  table: TableNode,
};

export interface MongoERDiagramViewProps {
  collections: string[];
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  manual: MongoRelationship[];
  onSelectRelationship?: (rel: MongoInferredRelationship | MongoRelationship) => void;
}

export function MongoERDiagramViewContent({
  collections,
  inferred,
  confirmed,
  manual,
  onSelectRelationship,
}: MongoERDiagramViewProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes, edges } = transformMongoToER({
      collections,
      confirmed,
      inferred,
      manual,
      useDagreLayout: true,
    });
    return { initialNodes: nodes, initialEdges: edges };
  }, [collections, confirmed, inferred, manual]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Dynamic synchronization of nodes & edges with position preservation
  useEffect(() => {
    setNodes((currentNodes) => {
      const posMap = new Map(currentNodes.map((n) => [n.id, n.position]));
      return initialNodes.map((node) => {
        const existingPos = posMap.get(node.id);
        if (existingPos) {
          return {
            ...node,
            position: existingPos,
          };
        }
        return node;
      });
    });
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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
        <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
          Relationship Types
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
