import { useCallback, useEffect, useRef } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { bridgeApi } from "@/services/bridgeApi";

const ANNOTATION_SAVE_DEBOUNCE_MS = 2000;

interface AnnotationLayerProps {
    projectId: string;
    active: boolean;
}

export default function AnnotationLayer({ projectId, active }: AnnotationLayerProps) {
    const editorRef = useRef<Editor | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadedRef = useRef(false);

    // Save current snapshot to backend (debounced)
    const scheduleSave = useCallback(() => {
        if (!projectId || !editorRef.current) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(() => {
            const editor = editorRef.current;
            if (!editor) return;

            const snapshot = editor.getSnapshot();
            bridgeApi
                .saveProjectAnnotations(projectId, snapshot)
                .then(() => console.debug("[Annotations] Saved"))
                .catch((err) => console.warn("[Annotations] Save failed:", err.message));
        }, ANNOTATION_SAVE_DEBOUNCE_MS);
    }, [projectId]);

    // Handle tldraw mount
    const handleMount = useCallback(
        (editor: Editor) => {
            editorRef.current = editor;

            // Load saved annotations
            if (projectId) {
                bridgeApi
                    .getProjectAnnotations(projectId)
                    .then((file) => {
                        if (file?.snapshot && Object.keys(file.snapshot).length > 0) {
                            editor.loadSnapshot(file.snapshot);
                        }
                        loadedRef.current = true;
                    })
                    .catch((err) => {
                        console.warn("[Annotations] Load failed:", err.message);
                        loadedRef.current = true;
                    });
            } else {
                loadedRef.current = true;
            }

            // Listen for all store changes and schedule save
            const unsubscribe = editor.store.listen(
                () => {
                    if (loadedRef.current) {
                        scheduleSave();
                    }
                },
                { source: "user", scope: "document" }
            );

            return () => {
                unsubscribe();
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            };
        },
        [projectId, scheduleSave]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    return (
        <div
            className="absolute inset-0 z-20 tldraw-annotation-layer"
            style={{
                pointerEvents: active ? "auto" : "none",
                visibility: active ? "visible" : "hidden",
            }}
        >
            <style>{`
                .tldraw-annotation-layer .tl-background {
                    background: rgba(255, 255, 255, 0.85) !important;
                }
                .tldraw-annotation-layer .tl-canvas {
                    background: transparent !important;
                }
                .tldraw-annotation-layer [data-testid="tldraw"] {
                    background: transparent !important;
                }
            `}</style>
            <Tldraw
                onMount={handleMount}
                hideUi={!active}
                options={{ maxPages: 1 }}
            />
        </div>
    );
}
