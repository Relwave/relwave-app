import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface FloatingActionButtonProps {
    icon?: React.ReactNode;
    label: string;
    onClick: () => void;
    position?: 'bottom-right' | 'bottom-left';
}

export default function FloatingActionButton({
    icon = <Plus className="h-6 w-6" />,
    label,
    onClick,
    position = 'bottom-right',
}: FloatingActionButtonProps) {
    const positionClasses = {
        'bottom-right': 'bottom-8 right-8',
        'bottom-left': 'bottom-8 left-8',
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    onClick={onClick}
                    size="icon"
                    className={`
            fixed ${positionClasses[position]} z-50
            h-16 w-16 rounded-full shadow-lg
            hover:shadow-xl hover:scale-105
            transition-all duration-200
            bg-primary hover:bg-primary/90
          `}
                >
                    {icon}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    );
}
