import { useState, useEffect, useMemo } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

export interface ConnectionGroup {
  id: string;
  name: string;
  color?: string;
  connectionIds: string[];
  isCollapsed?: boolean;
}

const STORAGE_KEY = 'relwave-connection-groups';
const UNGROUPED_ORDER_KEY = 'relwave-ungrouped-order';

export function useConnectionGroups(allConnectionIds: string[]) {
  const [groups, setGroups] = useState<ConnectionGroup[]>([]);
  const [ungroupedOrder, setUngroupedOrder] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const savedGroups = localStorage.getItem(STORAGE_KEY);
    const savedOrder = localStorage.getItem(UNGROUPED_ORDER_KEY);
    
    if (savedGroups) {
      try {
        setGroups(JSON.parse(savedGroups));
      } catch (e) {
        console.error('Failed to load connection groups', e);
      }
    }

    if (savedOrder) {
      try {
        setUngroupedOrder(JSON.parse(savedOrder));
      } catch (e) {
        console.error('Failed to load ungrouped order', e);
      }
    }
    
    setInitialized(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (initialized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
      localStorage.setItem(UNGROUPED_ORDER_KEY, JSON.stringify(ungroupedOrder));
    }
  }, [groups, ungroupedOrder, initialized]);

  // Sync ungroupedOrder with allConnectionIds (add new ones, remove deleted ones)
  useEffect(() => {
    if (!initialized) return;

    const connectionToGroupMap = new Map<string, string>();
    groups.forEach(g => {
      g.connectionIds.forEach(id => connectionToGroupMap.set(id, g.id));
    });

    const currentUngroupedIds = allConnectionIds.filter(id => !connectionToGroupMap.has(id));
    
    setUngroupedOrder(prev => {
      // Keep existing order for items that are still ungrouped
      const newOrder = prev.filter(id => currentUngroupedIds.includes(id));
      
      // Add new items that aren't in the order yet
      const added = currentUngroupedIds.filter(id => !newOrder.includes(id));
      
      if (added.length === 0 && newOrder.length === prev.length) return prev;
      return [...newOrder, ...added];
    });
  }, [allConnectionIds, groups, initialized]);

  const addGroup = (name: string, color?: string) => {
    const newGroup: ConnectionGroup = {
      id: crypto.randomUUID(),
      name,
      color,
      connectionIds: [],
      isCollapsed: false,
    };
    setGroups([...groups, newGroup]);
  };

  const deleteGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
        // Move connections back to ungrouped order
        setUngroupedOrder(prev => [...prev, ...group.connectionIds]);
    }
    setGroups(groups.filter(g => g.id !== groupId));
  };

  const toggleGroupCollapse = (groupId: string) => {
    setGroups(groups.map(g => 
      g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g
    ));
  };

  const removeFromGroup = (connectionId: string) => {
    setGroups(prev => prev.map(g => ({
        ...g,
        connectionIds: g.connectionIds.filter(id => id !== connectionId)
    })));
    setUngroupedOrder(prev => {
        if (prev.includes(connectionId)) return prev;
        return [...prev, connectionId];
    });
  };

  const moveConnection = (connectionId: string, overId: string) => {
    if (connectionId === overId) return;

    setGroups(prevGroups => {
      const activeGroup = prevGroups.find(g => g.connectionIds.includes(connectionId));
      
      // If dropping over a group header or the group container itself
      const isTargetingGroupHeader = prevGroups.some(g => g.id === overId);
      const targetGroup = prevGroups.find(g => g.id === overId || g.connectionIds.includes(overId));
      
      const isTargetingUngrouped = overId === 'ungrouped' || ungroupedOrder.includes(overId);

      // 1. Reordering within the same group
      if (activeGroup && targetGroup && activeGroup.id === targetGroup.id) {
        const oldIndex = activeGroup.connectionIds.indexOf(connectionId);
        const newIndex = activeGroup.connectionIds.indexOf(overId);
        
        if (newIndex !== -1) {
            return prevGroups.map(g => 
                g.id === activeGroup.id 
                ? { ...g, connectionIds: arrayMove(g.connectionIds, oldIndex, newIndex) }
                : g
            );
        }
        return prevGroups;
      }

      // 2. Moving from one group to another (or to a group header)
      if (targetGroup && (!activeGroup || activeGroup.id !== targetGroup.id)) {
        setUngroupedOrder(prev => prev.filter(id => id !== connectionId));
        return prevGroups.map(g => {
            if (activeGroup && g.id === activeGroup.id) {
                return { ...g, connectionIds: g.connectionIds.filter(id => id !== connectionId) };
            }
            if (g.id === targetGroup.id) {
                const targetIndex = g.connectionIds.indexOf(overId);
                const newIds = [...g.connectionIds.filter(id => id !== connectionId)];
                if (targetIndex !== -1) {
                    newIds.splice(targetIndex, 0, connectionId);
                } else {
                    newIds.push(connectionId);
                }
                return { ...g, connectionIds: newIds };
            }
            return g;
        });
      }

      // 3. Moving to ungrouped (header or item)
      if (isTargetingUngrouped) {
        const targetIndex = ungroupedOrder.indexOf(overId);
        setUngroupedOrder(prev => {
            const newOrder = [...prev.filter(id => id !== connectionId)];
            if (targetIndex !== -1) {
                newOrder.splice(targetIndex, 0, connectionId);
            } else {
                newOrder.push(connectionId);
            }
            return newOrder;
        });
        
        if (activeGroup) {
            return prevGroups.map(g => 
                g.id === activeGroup.id 
                ? { ...g, connectionIds: g.connectionIds.filter(id => id !== connectionId) }
                : g
            );
        }
        return prevGroups;
      }

      return prevGroups;
    });
  };

  const renameGroup = (groupId: string, newName: string) => {
    setGroups(groups.map(g => g.id === groupId ? { ...g, name: newName } : g));
  };

  return {
    groups,
    ungroupedIds: ungroupedOrder,
    addGroup,
    deleteGroup,
    renameGroup,
    toggleGroupCollapse,
    moveConnection,
    removeFromGroup,
    setGroups
  };
}
