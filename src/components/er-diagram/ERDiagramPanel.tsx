import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import TableNode from "@/components/er-diagram/TableNode";
import ERDiagramContent from "@/components/er-diagram/ERDiagramContent";

const nodeTypes = {
    table: TableNode,
} as const;

export default function ERDiagramPanel() {
    return (
        <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
            <ReactFlowProvider>
                <ERDiagramContent nodeTypes={nodeTypes} />
            </ReactFlowProvider>
        </div>
    );
}
