// features/project/components/ProjectsEmptyState.tsx

import { FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectsEmptyStateProps {
    hasProjects: boolean;
    onCreateClick: () => void;
}

export const ProjectsEmptyState = ({ hasProjects, onCreateClick }: ProjectsEmptyStateProps) => (
    <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
                <h1 className="text-xl font-semibold">Projects</h1>
                <p className="text-sm text-muted-foreground">
                    Save database details, ER diagrams &amp; queries offline
                </p>
            </div>
        </div>

        {!hasProjects && (
            <Button onClick={onCreateClick} className="mt-4">
                <Sparkles className="h-4 w-4 mr-2" />
                Create Your First Project
            </Button>
        )}
    </div>
);