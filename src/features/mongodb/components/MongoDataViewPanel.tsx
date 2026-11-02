import React from "react";
import { useMongoDatabaseDetails } from "../hooks/useMongoDatabaseDetails";
import { MongoCollectionsSidebar } from "./MongoCollectionsSidebar";
import { MongoDocumentViewer } from "./MongoDocumentViewer";
import { MongoSchemaPanel } from "./MongoSchemaPanel";
import { MongoIndexesPanel } from "./indexes/MongoIndexesPanel";
import { MongoInsertDocumentDialog } from "./MongoInsertDocumentDialog";
import { MongoEditDocumentDialog } from "./MongoEditDocumentDialog";
import { MongoDeleteDocumentDialog } from "./MongoDeleteDocumentDialog";
import { MongoCreateCollectionDialog } from "./MongoCreateCollectionDialog";
import { MongoDropCollectionDialog } from "./MongoDropCollectionDialog";
import { MongoCollectionRelationshipsTab } from "./relationships";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, GitBranch, Database, Layers, Network } from "lucide-react";

export function MongoDataViewPanel({
  dbId,
  databaseName,
  projectId,
}: {
  dbId: string;
  databaseName: string;
  projectId?: string | null;
}) {
  const {
    collections,
    collectionsLoading,
    selectedCollection,
    setSelectedCollection,
    documents,
    totalDocuments,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    sortField,
    sortDirection,
    handleSort,
    filterInput,
    setFilterInput,
    appliedFilter,
    applyFilter,
    resetFilter,
    activeTab,
    setActiveTab,
    isLoadingDocuments,
    refetchDocuments,
    refetchCollections,
    isInsertDialogOpen,
    setIsInsertDialogOpen,
    editingDocument,
    setEditingDocument,
    deletingDocument,
    setDeletingDocument,
    isCreateCollectionOpen,
    setIsCreateCollectionOpen,
    droppingCollection,
    setDroppingCollection,
    handleCollectionCreated,
    handleCollectionDropped,
  } = useMongoDatabaseDetails(dbId);

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col overflow-hidden bg-background text-foreground">
      {/* Top Banner / Collection Header */}
      <div className="h-12 px-4 border-b border-border/40 flex items-center justify-between bg-sidebar/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="font-semibold text-sm">{databaseName}</span>
          </div>

          {selectedCollection && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground font-medium">
                {selectedCollection}
              </span>
            </>
          )}
        </div>

        {selectedCollection && (
          <Tabs
            value={activeTab}
            onValueChange={(val) =>
              setActiveTab(val as "documents" | "schema" | "indexes" | "relationships")
            }
          >
            <TabsList className="h-8 bg-muted/60">
              <TabsTrigger
                value="documents"
                className="text-xs gap-1.5 data-[state=active]:bg-background"
              >
                <FileText className="h-3.5 w-3.5" />
                Documents
              </TabsTrigger>
              <TabsTrigger
                value="schema"
                className="text-xs gap-1.5 data-[state=active]:bg-background"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Inferred Schema
              </TabsTrigger>
              <TabsTrigger
                value="indexes"
                className="text-xs gap-1.5 data-[state=active]:bg-background"
              >
                <Layers className="h-3.5 w-3.5" />
                Indexes
              </TabsTrigger>
              <TabsTrigger
                value="relationships"
                className="text-xs gap-1.5 data-[state=active]:bg-background"
              >
                <Network className="h-3.5 w-3.5" />
                Relationships
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Main split: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        <MongoCollectionsSidebar
          collections={collections}
          selectedCollection={selectedCollection}
          onSelectCollection={setSelectedCollection}
          isLoading={collectionsLoading}
          onRefresh={refetchCollections}
          onCreateCollection={() => setIsCreateCollectionOpen(true)}
          onDropCollection={(name) => setDroppingCollection(name)}
        />

        <div className="flex-1 flex overflow-hidden">
          {!selectedCollection ? (
            <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground">
              Select a collection from the sidebar to view documents.
            </div>
          ) : activeTab === "documents" ? (
            <MongoDocumentViewer
              collection={selectedCollection}
              documents={documents}
              totalDocuments={totalDocuments}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              isLoading={isLoadingDocuments}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              filterInput={filterInput}
              onFilterInputChange={setFilterInput}
              onApplyFilter={applyFilter}
              onResetFilter={resetFilter}
              isFilterApplied={!!appliedFilter}
              onRefresh={refetchDocuments}
              onInsertDocument={() => setIsInsertDialogOpen(true)}
              onEditDocument={(doc) => setEditingDocument(doc)}
              onDeleteDocument={(doc) => setDeletingDocument(doc)}
            />
          ) : activeTab === "schema" ? (
            <MongoSchemaPanel dbId={dbId} collection={selectedCollection} />
          ) : activeTab === "relationships" ? (
            <MongoCollectionRelationshipsTab
              dbId={dbId}
              projectId={projectId ?? undefined}
              collection={selectedCollection}
              onSelectCollection={setSelectedCollection}
            />
          ) : (
            <MongoIndexesPanel dbId={dbId} collection={selectedCollection} />
          )}
        </div>
      </div>

      {/* M4 Mutation Modals */}
      {selectedCollection && (
        <>
          <MongoInsertDocumentDialog
            open={isInsertDialogOpen}
            onOpenChange={setIsInsertDialogOpen}
            dbId={dbId}
            collection={selectedCollection}
          />
          <MongoEditDocumentDialog
            open={!!editingDocument}
            onOpenChange={(open) => !open && setEditingDocument(null)}
            dbId={dbId}
            collection={selectedCollection}
            document={editingDocument}
            onRefreshView={refetchDocuments}
          />
          <MongoDeleteDocumentDialog
            open={!!deletingDocument}
            onOpenChange={(open) => !open && setDeletingDocument(null)}
            dbId={dbId}
            collection={selectedCollection}
            document={deletingDocument}
            onRefreshView={refetchDocuments}
          />
        </>
      )}

      <MongoCreateCollectionDialog
        open={isCreateCollectionOpen}
        onOpenChange={setIsCreateCollectionOpen}
        dbId={dbId}
        onCollectionCreated={handleCollectionCreated}
      />

      {droppingCollection && (
        <MongoDropCollectionDialog
          open={!!droppingCollection}
          onOpenChange={(open) => !open && setDroppingCollection(null)}
          dbId={dbId}
          collection={droppingCollection}
          onCollectionDropped={handleCollectionDropped}
        />
      )}
    </div>
  );
}
