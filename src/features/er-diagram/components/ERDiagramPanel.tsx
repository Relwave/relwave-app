import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "@/features/er-diagram/components/TableNode";
import ERDiagramContent from "@/features/er-diagram/components/ERDiagramContent";

const nodeTypes = {
  table: TableNode,
} as const;

interface ERDiagramPanelProps {
  projectId?: string | null;
}

export default function ERDiagramPanel({ projectId }: ERDiagramPanelProps) {
  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      <ReactFlowProvider>
        <ERDiagramContent nodeTypes={nodeTypes} projectId={projectId} />
      </ReactFlowProvider>
    </div>
  );
}
