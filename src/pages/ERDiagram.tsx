import { useParams } from "react-router-dom";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "@/components/er-diagram/TableNode";
import ERDiagramContent from "@/components/er-diagram/ERDiagramContent";
import VerticalIconBar from "@/components/common/VerticalIconBar";

const nodeTypes = {
  table: TableNode,
} as const;

export default function ERDiagram() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
      <VerticalIconBar dbId={id} />

      <main className="flex-1 ml-[60px] flex flex-col">
        {/* Header */}
        <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm">
          <div className="px-8 py-4">
            <h1 className="text-xl font-semibold">ER Diagram</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visualize database relationships
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1">
          <ReactFlowProvider>
            <ERDiagramContent nodeTypes={nodeTypes} />
          </ReactFlowProvider>
        </div>
      </main>
    </div>
  );
}