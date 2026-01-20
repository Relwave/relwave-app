import { createRoot } from 'react-dom/client';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DatabaseDetail from './pages/DatabaseDetails';
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
