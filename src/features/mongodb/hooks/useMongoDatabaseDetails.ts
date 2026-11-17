import { useState, useEffect, useMemo, useCallback } from "react";
import { useMongoCollections, useMongoDocuments } from "../../project/hooks/useDbQueries";
import { EJSONDocument, MongoFindRequest } from "../types";

export type CanonicalAST =
  | ["null", null]
  | ["undefined", null]
  | ["bool", boolean]
  | ["num", number]
  | ["nan", "NaN"]
  | ["inf", "+Inf"]
  | ["ninf", "-Inf"]
  | ["bigint", string]
  | ["str", string]
  | ["date", string]
  | ["date_invalid", "Invalid Date"]
  | ["regex", { p: string; f: string }]
  | ["arr", CanonicalAST[]]
  | ["obj", [string, CanonicalAST][]]
  | ["ejson_int", string]
  | ["ejson_long", string]
  | ["ejson_decimal", string]
  | ["ejson_oid", string]
  | ["ejson_binary", { b: string; s: string }];

const INT32_REGEX = /^-?(?:0|[1-9]\d*)$/;
const INT64_REGEX = /^-?(?:0|[1-9]\d*)$/;
const DECIMAL128_REGEX = /^-?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const BASE64_ALPHABET_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX2_REGEX = /^[0-9a-fA-F]{2}$/;

/** Phase 2 Canonical Base64 & Subtype Validation */
export function validateAndNormalizeEjsonBinary(bin: any): { b: string; s: string } {
  if (!bin || typeof bin !== "object") {
    throw new Error("MONGO_INVALID_FILTER: Invalid EJSON $binary: payload must be an object");
  }

  const allowedKeys = new Set(["base64", "subType", "subtype", "$base64", "$type"]);
  for (const k of Object.keys(bin)) {
    if (!allowedKeys.has(k)) {
      throw new Error(
        `MONGO_INVALID_FILTER: Invalid EJSON $binary: unexpected nested field '${k}'`,
      );
    }
  }

  const rawBase64 = bin.base64 ?? bin.$base64;
  if (typeof rawBase64 !== "string") {
    throw new Error("MONGO_INVALID_FILTER: Invalid EJSON $binary: base64 payload must be a string");
  }

  const normalizedBase64 = rawBase64.trim();
  if (normalizedBase64.length % 4 === 1) {
    throw new Error(
      "MONGO_INVALID_FILTER: Invalid EJSON $binary: invalid base64 length (modulo 4 cannot be 1)",
    );
  }
  if (!BASE64_ALPHABET_REGEX.test(normalizedBase64)) {
    throw new Error(
      "MONGO_INVALID_FILTER: Invalid EJSON $binary: invalid characters in base64 payload",
    );
  }

  const padNeeded = (4 - (normalizedBase64.length % 4)) % 4;
  const paddedBase64 = normalizedBase64 + "=".repeat(padNeeded);

  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(paddedBase64, "base64");
    if (buf.toString("base64") !== paddedBase64) {
      throw new Error(
        "MONGO_INVALID_FILTER: Invalid EJSON $binary: non-canonical base64 encoding (unused pad bits must be zero)",
      );
    }
  } else if (typeof atob !== "undefined" && typeof btoa !== "undefined") {
    try {
      const binStr = atob(paddedBase64);
      if (btoa(binStr) !== paddedBase64) {
        throw new Error(
          "MONGO_INVALID_FILTER: Invalid EJSON $binary: non-canonical base64 encoding (unused pad bits must be zero)",
        );
      }
    } catch {
      throw new Error("MONGO_INVALID_FILTER: Invalid EJSON $binary: invalid base64 encoding");
    }
  }

  const rawSubtype = bin.subType ?? bin.subtype ?? bin.$type ?? "00";
  let normalizedSubtype: string;
  if (typeof rawSubtype === "number") {
    if (!Number.isInteger(rawSubtype) || rawSubtype < 0 || rawSubtype > 255) {
      throw new Error(
        `MONGO_INVALID_FILTER: Invalid EJSON $binary: integer subtype must be in range 0..255, received ${rawSubtype}`,
      );
    }
    normalizedSubtype = rawSubtype.toString(16).padStart(2, "0").toLowerCase();
  } else if (typeof rawSubtype === "string") {
    if (!HEX2_REGEX.test(rawSubtype)) {
      throw new Error(
        `MONGO_INVALID_FILTER: Invalid EJSON $binary: string subtype must be a 2-character hex string, received '${rawSubtype}'`,
      );
    }
    normalizedSubtype = rawSubtype.toLowerCase();
  } else {
    throw new Error(
      "MONGO_INVALID_FILTER: Invalid EJSON $binary: subtype must be an integer (0..255) or 2-char hex string",
    );
  }

  return { b: paddedBase64, s: normalizedSubtype };
}

export function canonicalizeValue(val: unknown, visitedStack = new Set<object>()): CanonicalAST {
  if (val === null) return ["null", null];
  if (val === undefined) return ["undefined", null];

  const type = typeof val;

  if (type === "boolean") return ["bool", val as boolean];
  if (type === "bigint") return ["bigint", (val as bigint).toString()];
  if (type === "string") return ["str", val as string];

  if (type === "number") {
    const num = val as number;
    if (Number.isNaN(num)) return ["nan", "NaN"];
    if (!Number.isFinite(num)) return num > 0 ? ["inf", "+Inf"] : ["ninf", "-Inf"];
    return ["num", num];
  }

  if (type === "symbol" || type === "function") {
    throw new Error(`MONGO_INVALID_FILTER: Unsupported filter value type: ${type}`);
  }

  if (type === "object") {
    const obj = val as object;

    // Strict recursion-stack cycle detection (permits DAG reference sharing)
    if (visitedStack.has(obj)) {
      throw new Error("MONGO_CYCLIC_FILTER: Cyclic reference detected in MongoDB filter");
    }
    visitedStack.add(obj);

    try {
      if (val instanceof Date) {
        return Number.isNaN(val.getTime())
          ? ["date_invalid", "Invalid Date"]
          : ["date", val.toISOString()];
      }

      if (val instanceof RegExp) {
        return ["regex", { p: val.source, f: val.flags.split("").sort().join("") }];
      }

      if (Array.isArray(val)) {
        return ["arr", val.map((item) => canonicalizeValue(item, visitedStack))];
      }

      // Reject unsupported class instances (Map, Set, custom classes)
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error("MONGO_INVALID_FILTER: Unsupported object type in MongoDB filter");
      }

      // Reject symbol-keyed own properties explicitly
      const ownSymbols = Object.getOwnPropertySymbols(obj);
      if (ownSymbols.length > 0) {
        throw new Error(
          `MONGO_INVALID_FILTER: Symbol-keyed own properties are unsupported in MongoDB filter: ${ownSymbols.map(String).join(", ")}`,
        );
      }

      const record = val as Record<string, any>;
      const ownStringKeys = Object.getOwnPropertyNames(record).sort();

      // Strict EJSON primitive marker validation (must be sole field)
      if (ownStringKeys.length === 1) {
        const soleKey = ownStringKeys[0];

        if (soleKey === "$numberInt") {
          const raw = record.$numberInt;
          if (typeof raw !== "string" || !INT32_REGEX.test(raw)) {
            throw new Error(`MONGO_INVALID_FILTER: Malformed $numberInt representation: ${raw}`);
          }
          const num = Number(raw);
          if (num < -2147483648 || num > 2147483647) {
            throw new Error(`MONGO_INVALID_FILTER: $numberInt out of 32-bit range: ${raw}`);
          }
          return ["ejson_int", raw];
        }

        if (soleKey === "$numberLong") {
          const raw = record.$numberLong;
          if (typeof raw !== "string" || !INT64_REGEX.test(raw)) {
            throw new Error(`MONGO_INVALID_FILTER: Malformed $numberLong representation: ${raw}`);
          }
          const b = BigInt(raw);
          if (b < -9223372036854775808n || b > 9223372036854775807n) {
            throw new Error(`MONGO_INVALID_FILTER: $numberLong out of 64-bit range: ${raw}`);
          }
          return ["ejson_long", raw];
        }

        if (soleKey === "$numberDecimal") {
          const raw = record.$numberDecimal;
          if (
            typeof raw !== "string" ||
            (!DECIMAL128_REGEX.test(raw) &&
              raw !== "NaN" &&
              raw !== "Infinity" &&
              raw !== "-Infinity")
          ) {
            throw new Error(
              `MONGO_INVALID_FILTER: Malformed $numberDecimal representation: ${raw}`,
            );
          }
          return ["ejson_decimal", raw];
        }

        if (soleKey === "$oid") {
          const raw = record.$oid;
          if (typeof raw !== "string" || !/^[0-9a-fA-F]{24}$/.test(raw)) {
            throw new Error(`MONGO_INVALID_FILTER: Malformed $oid representation: ${raw}`);
          }
          return ["ejson_oid", raw.toLowerCase()];
        }

        if (soleKey === "$binary") {
          return ["ejson_binary", validateAndNormalizeEjsonBinary(record.$binary)];
        }
      }

      // Ordinary Plain Object: encodes own properties safely without prototype pollution
      const entries: [string, CanonicalAST][] = ownStringKeys.map((k) => [
        k,
        canonicalizeValue(record[k], visitedStack),
      ]);

      return ["obj", entries];
    } finally {
      visitedStack.delete(obj);
    }
  }

  throw new Error(`MONGO_INVALID_FILTER: Unrecognized value type: ${typeof val}`);
}

export function isExplicitEmptyFilter(filter: unknown): boolean {
  if (filter === undefined || filter === null) return true;
  if (
    typeof filter === "object" &&
    !Array.isArray(filter) &&
    !(filter instanceof Date) &&
    !(filter instanceof RegExp)
  ) {
    const proto = Object.getPrototypeOf(filter);
    if (proto === Object.prototype || proto === null) {
      return (
        Object.getOwnPropertyNames(filter).length === 0 &&
        Object.getOwnPropertySymbols(filter).length === 0
      );
    }
  }
  return false;
}

export function generateFilterKey(dbId: string, collection: string, filter?: unknown): string {
  if (isExplicitEmptyFilter(filter)) {
    return `${dbId}::${collection}::{}`;
  }
  const ast = canonicalizeValue(filter);
  return `${dbId}::${collection}::${JSON.stringify(ast)}`;
}

export function useMongoDatabaseDetails(dbId: string) {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<1 | -1 | null>(null);
  const [filterInput, setFilterInput] = useState<string>("");
  const [appliedFilter, setAppliedFilter] = useState<EJSONDocument | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"documents" | "schema" | "indexes" | "relationships">(
    "documents",
  );

  // Count Cache with Generation Tracking
  const [cacheGeneration, setCacheGeneration] = useState(0);

  // M4 Mutation Dialog States
  const [isInsertDialogOpen, setIsInsertDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<EJSONDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<EJSONDocument | null>(null);
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [droppingCollection, setDroppingCollection] = useState<string | null>(null);

  const {
    data: collectionsData,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useMongoCollections(dbId);

  const collections = useMemo(() => collectionsData?.collections || [], [collectionsData]);

  useEffect(() => {
    if (collections.length > 0 && !selectedCollection) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  const handleSelectCollection = useCallback((name: string) => {
    setSelectedCollection(name);
    setPage(1);
    setFilterInput("");
    setAppliedFilter(undefined);
    setSortField(null);
    setSortDirection(null);
  }, []);

  const handleSort = useCallback((field: string) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDir) => (currentDir === 1 ? -1 : currentDir === -1 ? null : 1));
        return field;
      }
      setSortDirection(1);
      return field;
    });
    setPage(1);
  }, []);

  const sortSpec = useMemo(() => {
    if (!sortField || !sortDirection) return undefined;
    return { [sortField]: sortDirection };
  }, [sortField, sortDirection]);

  const findRequest: MongoFindRequest | null = useMemo(() => {
    if (!dbId || !selectedCollection) return null;
    return {
      dbId,
      collection: selectedCollection,
      page,
      pageSize,
      filter: appliedFilter,
      sort: sortSpec,
    };
  }, [dbId, selectedCollection, page, pageSize, appliedFilter, sortSpec]);

  const {
    data: docResult,
    isLoading: isLoadingDocuments,
    isFetching: isFetchingDocuments,
    error: documentsError,
    refetch: refetchDocumentsQuery,
  } = useMongoDocuments(findRequest, !!selectedCollection);

  const applyFilter = useCallback((filterObj: EJSONDocument | undefined) => {
    setAppliedFilter(filterObj);
    setPage(1);
  }, []);

  const resetFilter = useCallback(() => {
    setFilterInput("");
    setAppliedFilter(undefined);
    setPage(1);
  }, []);

  // Manual refresh bypasses cache and bumps generation
  const manualRefresh = useCallback(() => {
    setCacheGeneration((gen) => gen + 1);
    refetchDocumentsQuery();
  }, [refetchDocumentsQuery]);

  const handleCollectionCreated = useCallback(
    (name: string) => {
      setCacheGeneration((gen) => gen + 1);
      refetchCollections();
      handleSelectCollection(name);
    },
    [refetchCollections, handleSelectCollection],
  );

  const handleCollectionDropped = useCallback(
    (name: string) => {
      setCacheGeneration((gen) => gen + 1);
      refetchCollections();
      if (selectedCollection === name) {
        const remaining = collections.filter((c) => c.name !== name);
        setSelectedCollection(remaining.length > 0 ? remaining[0].name : null);
        setPage(1);
      }
    },
    [refetchCollections, selectedCollection, collections],
  );

  // Option A Unknown-Count Navigation Properties
  const documents = docResult?.documents || [];
  const hasMore = docResult?.hasMore ?? false;
  const countOmitted = docResult?.countOmitted ?? docResult?.total === undefined;
  const totalDocuments = docResult?.total;
  const totalPages = docResult?.totalPages;

  const startIndex = documents.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = (page - 1) * pageSize + documents.length;
  const headerBadge = countOmitted
    ? `Showing ${startIndex}–${endIndex} (count omitted)`
    : `Showing ${startIndex}–${endIndex} of ${totalDocuments ?? 0}`;
  const footerText = countOmitted ? `Page ${page}` : `Page ${page} of ${totalPages ?? 1}`;
  const canPrev = page > 1;
  const canNext = hasMore;

  return {
    collections,
    collectionsLoading,
    collectionsError,
    selectedCollection,
    setSelectedCollection: handleSelectCollection,
    documents,
    totalDocuments: totalDocuments ?? 0,
    totalPages: totalPages ?? 1,
    hasMore,
    countOmitted,
    headerBadge,
    footerText,
    canPrev,
    canNext,
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
    isFetchingDocuments,
    documentsError,
    refetchDocuments: manualRefresh,
    refetchCollections,
    cacheGeneration,
    // M4 Mutation Dialog States & Handlers
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
  };
}
