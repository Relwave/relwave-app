import { useEffect, useState, useCallback } from 'react';
import { Command, Search, Database as DatabaseIcon, Table, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    Dialog,
    DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

interface CommandItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    action: () => void;
    category: string;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

    const commands: CommandItem[] = [
        {
            id: 'home',
            label: 'Go to Dashboard',
            icon: <DatabaseIcon className="h-4 w-4" />,
            action: () => navigate('/'),
            category: 'Navigation',
        },
        {
            id: 'settings',
            label: 'Go to Settings',
            icon: <Command className="h-4 w-4" />,
            action: () => navigate('/settings'),
            category: 'Navigation',
        },
    ];

    const filteredCommands = commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (command: CommandItem) => {
        command.action();
        onClose();
        setSearch('');
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] p-0 gap-0 backdrop-blur-md bg-background/95">
                <div className="flex items-center border-b border-border/20 px-4">
                    <Search className="h-5 w-5 text-muted-foreground mr-2" />
                    <Input
                        placeholder="Search everything..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base h-14"
                        autoFocus
                    />

                </div>

                <ScrollArea className="max-h-[400px]">
                    <div className="p-2">
                        {filteredCommands.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                                No results found
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {filteredCommands.map((command) => (
                                    <button
                                        key={command.id}
                                        onClick={() => handleSelect(command)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
                                            {command.icon}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">{command.label}</div>
                                            <div className="text-xs text-muted-foreground">{command.category}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="border-t border-border/20 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
                    <span>Type to search</span>
                    <div className="flex gap-2">
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/20 bg-muted px-1.5 font-mono text-[10px] font-medium">
                            ↑↓
                        </kbd>
                        <span>to navigate</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
