// features/database/hooks/useDatabaseDetailPage.ts

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PanelType } from "@/components/layout/VerticalIconBar";

export const useDatabaseDetailPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activePanel, setActivePanel] = useState<PanelType>("data");

    useEffect(() => {
        if (location.state?.activePanel) {
            setActivePanel(location.state.activePanel as PanelType);
            // Clear state so it doesn't reset on every navigation
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname]);

    const [migrationsOpen, setMigrationsOpen] = useState(false);
    const [chartOpen, setChartOpen] = useState(false);
    const [insertDialogOpen, setInsertDialogOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const toggleSidebar = () => setSidebarOpen((prev) => !prev);

    return {
        activePanel,
        setActivePanel,
        migrationsOpen,
        setMigrationsOpen,
        chartOpen,
        setChartOpen,
        insertDialogOpen,
        setInsertDialogOpen,
        sidebarOpen,
        toggleSidebar,
    };
};