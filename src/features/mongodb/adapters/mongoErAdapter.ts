import { MarkerType, Node, Edge } from "reactflow";
import dagre from "dagre";
import type {
  MongoCardinality,
  MongoInferredRelationship,
  MongoRelationship,
} from "../types/relationship";

export interface MongoCollectionNodeItem {
  name: string;
  type?: "collection" | "view";
  fields?: Array<{
    path: string;
    bsonType?: string;
  }>;
}

export interface MongoErAdapterOptions {
  collections: MongoCollectionNodeItem[] | string[];
  confirmed?: MongoRelationship[];
  inferred?: MongoInferredRelationship[];
  manual?: MongoRelationship[];
  useDagreLayout?: boolean;
}

export function formatMongoCardinality(cardinality: MongoCardinality): string {
  switch (cardinality) {
    case "one-to-one":
      return "1:1";
    case "one-to-many":
      return "1:N";
    case "many-to-one":
      return "N:1";
    case "many-to-many":
      return "N:M";
    case "insufficient-evidence":
      return "low-conf";
    default:
      return "unknown";
  }
}

export const CONFIRMED_COLOR = "#10b981";
export const INFERRED_COLOR = "#06b6d4";
export const MANUAL_COLOR = "#8b5cf6";

export function transformMongoToER({
  collections,
  confirmed = [],
  inferred = [],
  manual = [],
  useDagreLayout = true,
}: MongoErAdapterOptions) {
  const normCollections: MongoCollectionNodeItem[] = collections.map((c) =>
    typeof c === "string" ? { name: c } : c,
  );

  const collectionFields = new Map<string, Set<string>>();
  normCollections.forEach((c) => {
    const fields = new Set<string>();
    fields.add("_id");
    if (c.fields) {
      c.fields.forEach((f) => fields.add(f.path));
    }
    collectionFields.set(c.name, fields);
  });

  const registerField = (coll: string, field: string) => {
    let fields = collectionFields.get(coll);
    if (!fields) {
      fields = new Set<string>(["_id"]);
      collectionFields.set(coll, fields);
    }
    if (field) fields.add(field);
  };

  confirmed.forEach((r) => {
    registerField(r.sourceCollection, r.sourceField);
    registerField(r.targetCollection, r.targetField);
  });
  manual.forEach((r) => {
    registerField(r.sourceCollection, r.sourceField);
    registerField(r.targetCollection, r.targetField);
  });
  inferred.forEach((r) => {
    registerField(r.sourceCollection, r.sourceField);
    registerField(r.targetCollection, r.targetField);
  });

  // Collect all relationships with confirmed/manual precedence
  const allRels: Array<{
    rel: MongoRelationship | MongoInferredRelationship;
    kind: "manual" | "confirmed" | "inferred";
  }> = [
    ...confirmed.map((r) => ({ rel: r, kind: "confirmed" as const })),
    ...manual.map((r) => ({ rel: r, kind: "manual" as const })),
    ...inferred.map((r) => ({ rel: r, kind: "inferred" as const })),
  ];

  // Deduplicate field-to-field relationship pairs
  const dedupedRels: Array<MongoRelationship | MongoInferredRelationship> = [];
  const seenFieldPairs = new Set<string>();

  for (const item of allRels) {
    const pairKey = `${item.rel.sourceCollection}.${item.rel.sourceField}->${item.rel.targetCollection}.${item.rel.targetField}`;
    if (!seenFieldPairs.has(pairKey)) {
      seenFieldPairs.add(pairKey);
      dedupedRels.push(item.rel);
    }
  }

  const nodes: Node[] = [];
  let index = 0;

  collectionFields.forEach((fieldSet, collName) => {
    const columns = Array.from(fieldSet).map((f) => {
      const isPk = f === "_id";
      return {
        name: f,
        type: isPk ? "objectId" : "string",
        nullable: !isPk,
        isPrimaryKey: isPk,
        isForeignKey: !isPk,
      };
    });

    // Populate foreignKeys for outgoing connections so TableNode creates source handles
    const outgoingRels = dedupedRels.filter((r) => r.sourceCollection === collName);
    const foreignKeys = outgoingRels.map((r, idx) => ({
      constraint_name: r.id,
      source_schema: "collection",
      source_table: r.sourceCollection,
      source_column: r.sourceField,
      target_schema: "collection",
      target_table: r.targetCollection,
      target_column: r.targetField,
      update_rule: "NO ACTION",
      delete_rule: "NO ACTION",
      ordinal_position: idx + 1,
    }));

    // Populate uniqueConstraints for incoming connections targeting non-_id fields so TableNode creates target handles
    const incomingRels = dedupedRels.filter(
      (r) => r.targetCollection === collName && r.targetField !== "_id",
    );
    const uniqueConstraints = incomingRels.map((r) => ({
      column_name: r.targetField,
      constraint_name: r.id,
    }));

    const width = 240;
    const height = 40 + columns.length * 28 + 20;

    nodes.push({
      id: collName,
      type: "table",
      position: {
        x: (index % 3) * 320,
        y: Math.floor(index / 3) * 260,
      },
      width,
      height,
      data: {
        label: collName,
        schema: "collection",
        columns,
        foreignKeys,
        uniqueConstraints,
        isHighlighted: false,
      },
    });
    index++;
  });

  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  for (const item of allRels) {
    const r = item.rel;
    const kind = item.kind;
    const pairKey = `${r.sourceCollection}.${r.sourceField}->${r.targetCollection}.${r.targetField}`;

    if (seenEdges.has(pairKey)) {
      continue;
    }
    seenEdges.add(pairKey);

    const sourceHandleId = `${r.sourceCollection}-${r.sourceField}`;
    const targetHandleId = `${r.targetCollection}-${r.targetField}`;
    const edgeId = `edge-${r.sourceCollection}.${r.sourceField}->${r.targetCollection}.${r.targetField}`;

    const cardLabel = formatMongoCardinality(r.cardinality);
    let strokeColor = CONFIRMED_COLOR;
    let strokeDasharray: string | undefined = undefined;
    let label = `${cardLabel}`;

    if (kind === "confirmed") {
      strokeColor = CONFIRMED_COLOR;
      label = `${cardLabel}`;
    } else if (kind === "inferred") {
      strokeColor = INFERRED_COLOR;
      strokeDasharray = "5,5";
      label = `${cardLabel} (inferred)`;
    } else if (kind === "manual") {
      strokeColor = MANUAL_COLOR;
      label = `${cardLabel} (manual)`;
    }

    edges.push({
      id: edgeId,
      source: r.sourceCollection,
      target: r.targetCollection,
      sourceHandle: sourceHandleId,
      targetHandle: targetHandleId,
      animated: kind === "inferred",
      style: {
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 14,
        height: 14,
      },
      label,
      labelStyle: {
        fontSize: 10,
        fontWeight: 600,
        fill: strokeColor,
      },
      labelBgStyle: {
        fill: "rgba(15, 23, 42, 0.85)",
        fillOpacity: 0.9,
      },
      labelBgPadding: [4, 4],
      labelBgBorderRadius: 4,
      type: r.sourceCollection === r.targetCollection ? "smoothstep" : "default",
      data: {
        relationship: r,
        kind,
      },
    });
  }

  if (useDagreLayout && nodes.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: "LR",
      nodesep: 80,
      ranksep: 160,
      marginx: 40,
      marginy: 40,
    });

    nodes.forEach((n) => {
      g.setNode(n.id, {
        width: n.width || 240,
        height: n.height || 200,
      });
    });

    edges.forEach((e) => {
      if (e.source !== e.target) {
        g.setEdge(e.source, e.target);
      }
    });

    dagre.layout(g);

    nodes.forEach((n) => {
      const pos = g.node(n.id);
      if (pos) {
        n.position = {
          x: pos.x - (n.width || 240) / 2,
          y: pos.y - (n.height || 200) / 2,
        };
      }
    });
  }

  return { nodes, edges };
}
