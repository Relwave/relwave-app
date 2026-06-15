import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type DeleteConnectionDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionName: string;
    projectName: string;
    hasGitRemote: boolean;
    gitRemoteUrl?: string;
    onConfirm: (choice: "unlink" | "delete_project") => Promise<void>;
};

export function DeleteConnectionDialog({
    open,
    onOpenChange,
    connectionName,
    projectName,
    hasGitRemote,
    gitRemoteUrl,
    onConfirm,
}: DeleteConnectionDialogProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [choice, setChoice] = useState<"unlink" | "delete_project">("unlink");
    const [isDeleting, setIsDeleting] = useState(false);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep(1);
            setChoice("unlink");
            setIsDeleting(false);
        }
    }, [open]);

    const handleNext = async () => {
        if (choice === "unlink") {
            // Execute unlink flow directly, no second step
            setIsDeleting(true);
            try {
                await onConfirm("unlink");
            } finally {
                setIsDeleting(false);
            }
        } else {
            // Proceed to step 2 for project deletion confirmation
            setStep(2);
        }
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await onConfirm("delete_project");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    {step === 1 ? (
                        <>
                            <DialogTitle>Delete Connection</DialogTitle>
                            <DialogDescription className="text-muted-foreground mt-2">
                                <span className="font-medium text-foreground">{connectionName}</span>
                            </DialogDescription>
                        </>
                    ) : (
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            Are you absolutely sure?
                        </DialogTitle>
                    )}
                </DialogHeader>

                <div className="py-4">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <p className="text-sm">
                                This connection is linked to the project{" "}
                                <span className="font-semibold">"{projectName}"</span>.
                            </p>
                            <p className="text-sm font-medium">What would you like to do with the project?</p>
                            <RadioGroup
                                value={choice}
                                onValueChange={(val: "unlink" | "delete_project") => setChoice(val)}
                                className="space-y-3 mt-4"
                            >
                                <div className="flex items-start space-x-3 rounded-md border p-3 cursor-pointer" onClick={() => setChoice("unlink")}>
                                    <RadioGroupItem value="unlink" id="unlink" className="mt-1" />
                                    <Label htmlFor="unlink" className="font-normal cursor-pointer leading-tight">
                                        <div className="font-medium mb-1">Keep project (unlink connection only)</div>
                                        <div className="text-xs text-muted-foreground">
                                            Schemas, queries and migrations are kept
                                        </div>
                                    </Label>
                                </div>
                                <div className="flex items-start space-x-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 cursor-pointer" onClick={() => setChoice("delete_project")}>
                                    <RadioGroupItem value="delete_project" id="delete_project" className="mt-1" />
                                    <Label htmlFor="delete_project" className="font-normal cursor-pointer leading-tight">
                                        <div className="font-medium mb-1 text-destructive">Delete project as well</div>
                                        <div className="text-xs text-muted-foreground">
                                            Permanently removes all project data including migrations and diagrams
                                        </div>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm">
                                This will permanently delete:
                            </p>
                            <ul className="text-sm list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                                <li>migrations/</li>
                                <li>schema.json</li>
                                <li>diagrams/</li>
                                <li>All saved queries</li>
                            </ul>
                            <p className="text-sm font-medium text-destructive mt-4">
                                This cannot be undone.
                            </p>

                            {hasGitRemote && gitRemoteUrl && (
                                <div className="mt-4 p-3 rounded-md bg-muted border text-sm">
                                    <span className="font-semibold flex items-center gap-1 mb-1">
                                        ⚠ Note
                                    </span>
                                    <span className="text-muted-foreground">
                                        The remote repository at <code className="bg-background px-1 py-0.5 rounded">{gitRemoteUrl}</code> will not be deleted. Only the local project folder will be removed.
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                    {step === 1 ? (
                        <>
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                                Cancel
                            </Button>
                            <Button variant={choice === "delete_project" ? "destructive" : "default"} onClick={handleNext} disabled={isDeleting}>
                                {isDeleting ? "Processing..." : "Confirm Delete"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setStep(1)} disabled={isDeleting}>
                                Back
                            </Button>
                            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                                {isDeleting ? "Deleting..." : "Delete Everything"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
