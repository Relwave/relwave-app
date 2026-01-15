import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExpandableBottomPanelProps {
    isExpanded: boolean;
    onToggle: () => void;
    title: string;
    children: React.ReactNode;
    defaultHeight?: string;
}

export default function ExpandableBottomPanel({
    isExpanded,
    onToggle,
    title,
    children,
    defaultHeight = '40vh',
}: ExpandableBottomPanelProps) {
    return (
        <div
            className={`
        border-t border-border/20 bg-background
        transition-all duration-300 ease-in-out
        ${isExpanded ? '' : 'h-[60px]'}
      `}
            style={isExpanded ? { height: defaultHeight } : undefined}
        >
            {/* Header Bar */}
            <div className="h-[60px] px-6 flex items-center justify-between border-b border-border/20">
                <h3 className="text-sm font-semibold">{title}</h3>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggle}
                    className="text-xs"
                >
                    {isExpanded ? (
                        <>
                            <ChevronDown className="h-4 w-4 mr-1.5" />
                            Collapse
                        </>
                    ) : (
                        <>
                            <ChevronUp className="h-4 w-4 mr-1.5" />
                            Expand
                        </>
                    )}
                </Button>
            </div>

            {/* Content (only visible when expanded) */}
            {isExpanded && (
                <div className="h-[calc(100%-60px)] overflow-hidden">
                    {children}
                </div>
            )}
        </div>
    );
}
