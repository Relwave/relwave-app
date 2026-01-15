import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SlideOutPanelProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    width?: string;
    disableScroll?: boolean;
}

export default function SlideOutPanel({
    isOpen,
    onClose,
    title,
    children,
    width = '400px',
    disableScroll = false,
}: SlideOutPanelProps) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 top-8 bg-background/80 backdrop-blur-sm z-50"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className="fixed right-0 top-8 h-[calc(100vh-32px)] bg-background border-l border-border/20 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300"
                style={{ width }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 shrink-0">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                {disableScroll ? (
                    <div className="flex-1 overflow-hidden">
                        {children}
                    </div>
                ) : (
                    <ScrollArea className="flex-1 px-6 py-4">
                        {children}
                    </ScrollArea>
                )}
            </div>
        </>
    );
}
