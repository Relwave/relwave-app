import { createRoot } from 'react-dom/client';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import DatabaseDetail from './pages/DatabaseDetails';
import Projects from './pages/Projects';
import NotFound from './pages/NotFound';
import { ThemeProvider } from './components/providers/ThemeProvider';
import Settings from './pages/Settings';
import { useBridgeInit } from "@/services/bridge/useBridgeInit";
import { useEffect, useState } from 'react';
import { DeveloperContextMenu } from './components/dev/DeveloperContextMenu';
import { UpdateNotification } from './components/shared/UpdateNotification';
import { WhatsNewDialog } from './components/shared/WhatsNewDialog';
import TitleBar from './components/layout/TitleBar';
import VerticalIconBar from './components/layout/VerticalIconBar';

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

function GlobalSidebar() {
  const location = useLocation();
  const showOnGlobalRoutes = ['/', '/projects', '/settings'].includes(location.pathname);

  if (!showOnGlobalRoutes) {
    return null;
  }

  return <VerticalIconBar />;
}

function AnimatedRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (location.pathname === displayLocation.pathname) {
      return;
    }

    setTransitionStage('out');
    const timer = window.setTimeout(() => {
      setDisplayLocation(location);
      setTransitionStage('in');
    }, 130);

    return () => window.clearTimeout(timer);
  }, [location, displayLocation.pathname]);

  return (
    <div className={`route-transition route-transition--${transitionStage}`}>
      <Routes location={displayLocation}>
        <Route path="/" element={<Index />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/:id" element={<DatabaseDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

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
    <ThemeProvider defaultTheme="dark" storageKey="relwave-ui-theme">
      <QueryClientProvider client={queryClient}>
        <BridgeInitializer />
        <ThemeVariantInitializer />
        <UpdateNotification />
        <WhatsNewDialog />
        <TooltipProvider>
          <DeveloperContextMenu>
            <Toaster />
            <TitleBar />
            <div className="pt-8">
              <BrowserRouter>
                <GlobalSidebar />
                <AnimatedRoutes />
              </BrowserRouter>
            </div>
          </DeveloperContextMenu>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<AppRoot />);
