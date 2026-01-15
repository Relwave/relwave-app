import { ColumnDetails, DatabaseSchemaDetails, ForeignKeyInfo, TableSchemaDetails } from "@/types/database";
import { Edge, MarkerType, Node } from "reactflow";
import dagre from "dagre";

interface Column extends ColumnDetails {
  fkRef?: string; // e.g., "public.roles.id"
}

interface TableNodeData {
  label: string;
  schema: string;
  columns: Column[];
  foreignKeys?: ForeignKeyInfo[];
  indexes?: TableSchemaDetails["indexes"];
  uniqueConstraints?: TableSchemaDetails["uniqueConstraints"];
  checkConstraints?: TableSchemaDetails["checkConstraints"];
  isHighlighted?: boolean;
}

interface TransformedERData {
  nodes: Node<TableNodeData>[];
  edges: Edge<any>[];
}

// Estimate node dimensions based on content
const getNodeDimensions = (table: TableSchemaDetails) => {
  const baseWidth = 220;
  const headerHeight = 40;
  const columnHeight = 28;
  const footerHeight = 30;
  
  const width = Math.max(baseWidth, table.name.length * 10 + 80);
  const height = headerHeight + (table.columns.length * columnHeight) + footerHeight;
  
  return { width, height };
};

// Apply Dagre layout for better node positioning
const applyDagreLayout = (
  nodes: Node<TableNodeData>[],
  edges: Edge<any>[],
  direction: "TB" | "LR" = "LR"
): Node<TableNodeData>[] => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: direction, 
    nodesep: 80,
    ranksep: 150,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.width || 220, 
      height: node.height || 200 
    });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(dagreGraph);

  // Apply positions back to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (node.width || 220) / 2,
        y: nodeWithPosition.y - (node.height || 200) / 2,
      },
    };
  });
};

export const transformSchemaToER = (
  schema: DatabaseSchemaDetails,
  useDagreLayout: boolean = true
): TransformedERData => {
  const nodes: Node<TableNodeData>[] = [];
  const edges: Edge<any>[] = [];
  let nodeIndex = 0;
  
  // Colors
  const PRIMARY_CYAN = "#06B6D4"; // Tailwind cyan-500
  const SCHEMA_COLORS: Record<string, string> = {
    public: "#3B82F6",    // blue
    private: "#8B5CF6",   // purple
    auth: "#10B981",      // emerald
    analytics: "#F59E0B", // amber
  };

  // Build a map of column -> foreign key info for quick lookup
  const buildFkMap = (foreignKeys: ForeignKeyInfo[] = []): Map<string, ForeignKeyInfo> => {
    const map = new Map<string, ForeignKeyInfo>();
    foreignKeys.forEach(fk => {
      map.set(fk.source_column, fk);
    });
    return map;
  };

  // First pass: Create all nodes with enriched column data
  schema.schemas.forEach((schemaGroup) => {
    const schemaColor = SCHEMA_COLORS[schemaGroup.name] || "#6B7280";
    
    schemaGroup.tables.forEach((table) => {
      const tableName = `${schemaGroup.name}.${table.name}`;
      const fkMap = buildFkMap(table.foreignKeys);
      const { width, height } = getNodeDimensions(table);

      // Enrich columns with foreign key reference info
      const enrichedColumns: Column[] = table.columns.map(col => {
        const fkInfo = fkMap.get(col.name);
        return {
          ...col,
          fkRef: fkInfo ? `${fkInfo.target_schema}.${fkInfo.target_table}.${fkInfo.target_column}` : undefined,
        };
      });

      // Grid fallback position
      const x = (nodeIndex % 3) * 350;
      const y = Math.floor(nodeIndex / 3) * 350;

      nodes.push({
        id: tableName,
        type: "table",
        position: { x, y },
        width,
        height,
        data: {
          label: table.name,
          schema: schemaGroup.name,
          columns: enrichedColumns,
          foreignKeys: table.foreignKeys,
          indexes: table.indexes,
          uniqueConstraints: table.uniqueConstraints,
          checkConstraints: table.checkConstraints,
          isHighlighted: false,
        },
      });
      nodeIndex++;
    });
  });

  // Second pass: Create edges from foreignKeys array with cardinality
  schema.schemas.forEach((schemaGroup) => {
    schemaGroup.tables.forEach((table) => {
      const sourceNodeId = `${schemaGroup.name}.${table.name}`;

      if (table.foreignKeys && table.foreignKeys.length > 0) {
        table.foreignKeys.forEach((fk) => {
          const targetNodeId = `${fk.target_schema}.${fk.target_table}`;

          if (nodes.some((n) => n.id === targetNodeId)) {
            const sourceHandleId = `${table.name}-${fk.source_column}`;
            const targetHandleId = `${fk.target_table}-${fk.target_column}`;
            const edgeId = `${fk.constraint_name}-${fk.source_column}`;

            // Determine cardinality label
            const cardinalityLabel = "N:1"; // FK is always many-to-one

            edges.push({
              id: edgeId,
              source: sourceNodeId,
              target: targetNodeId,
              sourceHandle: sourceHandleId,
              targetHandle: targetHandleId,
              animated: false,
              style: { 
                stroke: PRIMARY_CYAN, 
                strokeWidth: 2,
              },
              // Crow's foot marker for "many" side (source)
              markerStart: {
                type: MarkerType.ArrowClosed,
                color: PRIMARY_CYAN,
                width: 12,
                height: 12,
              },
              // Simple marker for "one" side (target)
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: PRIMARY_CYAN,
                width: 15,
                height: 15,
              },
              label: cardinalityLabel,
              labelStyle: {
                fontSize: 10,
                fontWeight: 600,
                fill: "#6b7280",
              },
              labelBgStyle: {
                fill: "rgba(255,255,255,0.9)",
                fillOpacity: 0.9,
              },
              labelBgPadding: [4, 4] as [number, number],
              labelBgBorderRadius: 4,
              type: "smoothstep",
              data: {
                constraintName: fk.constraint_name,
                updateRule: fk.update_rule,
                deleteRule: fk.delete_rule,
                sourceColumn: fk.source_column,
                targetColumn: fk.target_column,
                sourceTable: fk.source_table,
                targetTable: fk.target_table,
              },
            });
          }
        });
      }
    });
  });

  // Apply Dagre layout if enabled and there are edges
  const layoutedNodes = useDagreLayout && edges.length > 0 
    ? applyDagreLayout(nodes, edges, "LR")
    : nodes;

  return { nodes: layoutedNodes, edges };
};
