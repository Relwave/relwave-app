import { createRoot } from 'react-dom/client';
import { startBridgeListeners } from './services/bridgeClient';
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DatabaseDetail from './pages/DatabaseDetails';
import NotFound from './pages/NotFound';
import ERDiagram from './pages/ERDiagram';
import QueryBuilder from './pages/QueryBuilder';
import { ThemeProvider } from './components/theme-provider';
import SchemaExplorer from './pages/SchemaExplorer';



startBridgeListeners();

const queryClient = new QueryClient();



createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/:id" element={<DatabaseDetail />} />
            <Route path="/database/:id/query-builder" element={<QueryBuilder />} />
            <Route path="/database/:id/er-diagram" element={<ERDiagram />} />
            <Route path='/database/:id/schema-explorer' element={<SchemaExplorer />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);