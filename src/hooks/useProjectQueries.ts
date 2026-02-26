import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bridgeApi } from "@/services/bridgeApi";
import { isBridgeReady } from "@/services/bridgeClient";
import {
  CreateProjectParams,
  UpdateProjectParams,
  SchemaSnapshot,
  ERNode,
  ImportProjectParams,
  ProjectMetadata,
} from "@/types/project";

// ============================================
// Query Keys
// ============================================
export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  byDatabaseId: (dbId: string) => ["projects", "byDb", dbId] as const,
  schema: (id: string) => ["projects", id, "schema"] as const,
  erDiagram: (id: string) => ["projects", id, "erDiagram"] as const,
  queries: (id: string) => ["projects", id, "queries"] as const,
  export: (id: string) => ["projects", id, "export"] as const,
  dir: (id: string) => ["projects", id, "dir"] as const,
};

// ============================================
// Stale times
// ============================================
const STALE_TIMES = {
  list: 5 * 60 * 1000,        // 5 min — project list rarely changes
  detail: 5 * 60 * 1000,
  schema: 10 * 60 * 1000,     // 10 min — cached schema
  erDiagram: 10 * 60 * 1000,
  queries: 2 * 60 * 1000,     // 2 min — queries update more often
};

// ============================================
// List Projects
// ============================================
export function useProjects() {
  const queryClient = useQueryClient();
  const bridgeReady =
    queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => bridgeApi.listProjects(),
    staleTime: STALE_TIMES.list,
    gcTime: 10 * 60 * 1000,
    enabled: bridgeReady,
  });
}

// ============================================
// Get Single Project
// ============================================
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId!),
    queryFn: () => bridgeApi.getProject(projectId!),
    staleTime: STALE_TIMES.detail,
    enabled: !!projectId,
  });
}

// ============================================
// Get Project by Database ID (for auto-sync)
// ============================================
export function useProjectByDatabaseId(databaseId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.byDatabaseId(databaseId!),
    queryFn: () => bridgeApi.getProjectByDatabaseId(databaseId!),
    staleTime: STALE_TIMES.detail,
    enabled: !!databaseId,
  });
}

// ============================================
// Get Project Filesystem Directory
// ============================================
export function useProjectDir(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.dir(projectId!),
    queryFn: () => bridgeApi.getProjectDir(projectId!),
    staleTime: Infinity, // path never changes for a given project
    gcTime: 30 * 60 * 1000,
    enabled: !!projectId,
  });
}

// ============================================
// Create Project
// ============================================
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateProjectParams) => bridgeApi.createProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

// ============================================
// Import Project (from cloned repo)
// ============================================
export function useImportProject() {
  const queryClient = useQueryClient();

  return useMutation<ProjectMetadata, Error, ImportProjectParams>({
    mutationFn: (params: ImportProjectParams) => bridgeApi.importProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

// ============================================
// Update Project
// ============================================
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateProjectParams) => bridgeApi.updateProject(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.id),
      });
    },
  });
}

// ============================================
// Delete Project
// ============================================
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => bridgeApi.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

// ============================================
// Project Schema (cached offline data)
// ============================================
export function useProjectSchema(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.schema(projectId!),
    queryFn: () => bridgeApi.getProjectSchema(projectId!),
    staleTime: STALE_TIMES.schema,
    enabled: !!projectId,
  });
}

export function useSaveProjectSchema() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      schemas,
    }: {
      projectId: string;
      schemas: SchemaSnapshot[];
    }) => bridgeApi.saveProjectSchema(projectId, schemas),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.schema(variables.projectId),
      });
    },
  });
}

// ============================================
// ER Diagram
// ============================================
export function useProjectERDiagram(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.erDiagram(projectId!),
    queryFn: () => bridgeApi.getProjectERDiagram(projectId!),
    staleTime: STALE_TIMES.erDiagram,
    enabled: !!projectId,
  });
}

export function useSaveProjectERDiagram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      nodes,
      zoom,
      panX,
      panY,
    }: {
      projectId: string;
      nodes: ERNode[];
      zoom?: number;
      panX?: number;
      panY?: number;
    }) => bridgeApi.saveProjectERDiagram(projectId, { nodes, zoom, panX, panY }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.erDiagram(variables.projectId),
      });
    },
  });
}

// ============================================
// Saved Queries
// ============================================
export function useProjectQueries(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.queries(projectId!),
    queryFn: () => bridgeApi.getProjectQueries(projectId!),
    staleTime: STALE_TIMES.queries,
    enabled: !!projectId,
  });
}

export function useAddProjectQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      sql,
      description,
    }: {
      projectId: string;
      name: string;
      sql: string;
      description?: string;
    }) => bridgeApi.addProjectQuery(projectId, { name, sql, description }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.queries(variables.projectId),
      });
    },
  });
}

export function useUpdateProjectQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      queryId,
      ...updates
    }: {
      projectId: string;
      queryId: string;
      name?: string;
      sql?: string;
      description?: string;
    }) => bridgeApi.updateProjectQuery(projectId, queryId, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.queries(variables.projectId),
      });
    },
  });
}

export function useDeleteProjectQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      queryId,
    }: {
      projectId: string;
      queryId: string;
    }) => bridgeApi.deleteProjectQuery(projectId, queryId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.queries(variables.projectId),
      });
    },
  });
}

// ============================================
// Export
// ============================================
export function useExportProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.export(projectId!),
    queryFn: () => bridgeApi.exportProject(projectId!),
    enabled: false, // Manual trigger only
  });
}
