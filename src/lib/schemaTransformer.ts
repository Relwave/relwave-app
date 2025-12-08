import {
  ColumnDetails,
  DatabaseSchemaDetails,
  TableSchemaDetails,
} from "@/services/bridgeApi";
import { Edge, MarkerType, Node } from "reactflow";

interface Column extends ColumnDetails {
  fkRef?: string; // e.g., "roles.id"
}

interface TableNodeData {
  label: string;
  columns: Column[];
}

interface TransformedERData {
  nodes: Node<TableNodeData>[];
  edges: Edge<any>[];
}

type BackendColumn = Omit<ColumnDetails, "type"> & {
  type: string;
  foreignKeyRef?: string;
};

type BackendTable = Omit<TableSchemaDetails, "columns"> & {
  columns: BackendColumn[];
};

export const transformSchemaToER = (
  schema: DatabaseSchemaDetails
): TransformedERData => {
  const nodes: Node<TableNodeData>[] = [];
  const edges: Edge<any>[] = [];
  let nodeIndex = 0;
  const NODE_WIDTH = 250;
  const X_GAP = 400;
  const Y_GAP = 300;
  const MAX_COLS = 3;
  const PRIMARY_CYAN = "#06B6D4"; // Tailwind cyan-500

  // First pass: Create all nodes and map their IDs
  schema.schemas.forEach((schemaGroup) => {
    schemaGroup.tables.forEach((table) => {
      // Use the fully qualified name as the unique ID for ReactFlow nodes
      const tableName = `${schemaGroup.name}.${table.name}`;

      const x = (nodeIndex % MAX_COLS) * X_GAP;
      const y = Math.floor(nodeIndex / MAX_COLS) * Y_GAP;

      nodes.push({
        id: tableName,
        type: "table",
        position: { x, y },
        data: { label: table.name, columns: table.columns as Column[] },
      });
      nodeIndex++;
    });
  });

  // Second pass: Create all edges
  schema.schemas.forEach((schemaGroup) => {
    schemaGroup.tables.forEach((table) => {
      const sourceNodeId = `${schemaGroup.name}.${table.name}`;

      table.columns.forEach((col) => {
        const column = col as BackendColumn;

        if (column.isForeignKey && column.foreignKeyRef) {
          const parts = column.foreignKeyRef.split(".");
          let targetSchemaName: string;
          let targetTableName: string;
          let targetColumnName: string | undefined;

          if (parts.length === 3) {
            [targetSchemaName, targetTableName, targetColumnName] = parts;
          } else if (parts.length === 2) {
            targetSchemaName = schemaGroup.name;
            [targetTableName, targetColumnName] = parts;
          } else if (parts.length === 1) {
            targetSchemaName = schemaGroup.name;
            targetTableName = parts[0];
            targetColumnName = undefined;
          } else {
            return;
          }

          const targetNodeId = `${targetSchemaName}.${targetTableName}`;

          if (nodes.some((n) => n.id === targetNodeId)) {
            const sourceHandleId = `${table.name}-${column.name}`;

            const targetHandleId = targetColumnName
              ? `${targetTableName}-${targetColumnName}`
              : undefined;

            edges.push({
              id: `${sourceNodeId}-${targetNodeId}-${col.name}`,
              source: sourceNodeId,
              target: targetNodeId,
              sourceHandle: sourceHandleId,
              targetHandle: targetHandleId,
              animated: false,
              // Use solid cyan color for edges and markers
              style: { stroke: PRIMARY_CYAN, strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: PRIMARY_CYAN,
                width: 15,
                height: 15,
              },
              label: col.name,
              // Use muted colors for edge labels
              labelStyle: {
                fontSize: 10,
                fontWeight: 500,
                fill: "#6b7280",
                backgroundColor: "rgba(255,255,255,0.7)",
              },
              type: "smoothstep",
            });
          }
        }
      });
    });
  });

  return { nodes, edges };
};
