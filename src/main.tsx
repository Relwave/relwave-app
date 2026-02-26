import { createRoot } from 'react-dom/client';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DatabaseDetail from './pages/DatabaseDetails';
import Projects from './pages/Projects';
import NotFound from './pages/NotFound';
import { ThemeProvider } from './components/common/ThemeProvider';
import Settings from './pages/Settings';
import { useBridgeInit } from "@/hooks/useBridgeInit";
import { useEffect } from 'react';
import { DeveloperContextMenu } from './components/common/DeveloperContextMenu';
import { UpdateNotification } from './components/common/UpdateNotification';

const queryClient = new QueryClient();

function BridgeInitializer() {
  useBridgeInit();
  return null;
}

function ThemeVariantInitializer() {
  useEffect(() => {
    // Initialize theme variant from localStorage on mount
    const savedVariant = localStorage.getItem('relwave-theme-variant');
    if (savedVariant) {
      document.documentElement.setAttribute('data-theme-variant', savedVariant);
    } else {
      document.documentElement.setAttribute('data-theme-variant', 'blue');
    }
  }, []);
  return null;
}


import TitleBar from './components/common/TitleBar';

function AppRoot() {
  useEffect(() => {
    const handleSelectAll = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        // Allow Ctrl+A inside inputs, textareas, and contenteditable
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleSelectAll);
    return () => document.removeEventListener('keydown', handleSelectAll);
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <BridgeInitializer />
        <ThemeVariantInitializer />
        <UpdateNotification />
        <TooltipProvider>
          <DeveloperContextMenu>
            <Toaster />
            <TitleBar />
            <div className="pt-8">
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/:id" element={<DatabaseDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </div>
          </DeveloperContextMenu>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<AppRoot />);
