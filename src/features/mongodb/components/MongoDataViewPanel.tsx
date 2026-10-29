import React from "react";
import { useMongoDatabaseDetails } from "../hooks/useMongoDatabaseDetails";
import { MongoCollectionsSidebar } from "./MongoCollectionsSidebar";
import { MongoDocumentViewer } from "./MongoDocumentViewer";
import { MongoSchemaPanel } from "./MongoSchemaPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, GitBranch, Database } from "lucide-react";

export function MongoDataViewPanel({ dbId, databaseName }: { dbId: string; databaseName: string }) {
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
            onValueChange={(val) => setActiveTab(val as "documents" | "schema")}
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
            />
          ) : (
            <MongoSchemaPanel dbId={dbId} collection={selectedCollection} />
          )}
        </div>
      </div>
    </div>
  );
}
