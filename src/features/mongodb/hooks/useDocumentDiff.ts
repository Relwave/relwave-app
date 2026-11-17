import { useMemo } from "react";

export interface DocumentDiffResult {
  hasChanges: boolean;
  updateDoc?: {
    $set?: Record<string, any>;
    $unset?: Record<string, "">;
  };
}

const EJSON_TAGS = new Set([
  "$oid",
  "$date",
  "$numberLong",
  "$numberInt",
  "$numberDouble",
  "$numberDecimal",
  "$binary",
  "$timestamp",
  "$regex",
  "$undefined",
]);

export function isEjsonScalar(val: any): boolean {
  if (val === null || typeof val !== "object" || Array.isArray(val)) {
    return false;
  }
  const keys = Object.keys(val);
  if (keys.length === 1 && EJSON_TAGS.has(keys[0])) {
    return true;
  }
  if (keys.length === 2 && keys.includes("$regex") && keys.includes("$options")) {
    return true;
  }
  return false;
}

export function isPlainObject(val: any): boolean {
  return val !== null && typeof val === "object" && !Array.isArray(val) && !isEjsonScalar(val);
}

export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function validateKey(key: string, isEjsonContext = false): void {
  if (key.startsWith(".") || key.endsWith(".") || key.includes("..")) {
    throw new Error(`INVALID_FIELD_PATH: Key '${key}' contains invalid dot syntax`);
  }
  if (!isEjsonContext && key.includes("$")) {
    throw new Error(`INVALID_FIELD_PATH: Key '${key}' must not contain '$'`);
  }
}

function assertNoPathCollisions(paths: string[]): void {
  for (let i = 0; i < paths.length; i++) {
    for (let j = 0; j < paths.length; j++) {
      if (i !== j) {
        const p1 = paths[i];
        const p2 = paths[j];
        if (p2.startsWith(p1 + ".")) {
          throw new Error(
            `PATH_COLLISION: Conflicting update paths '${p1}' and '${p2}' cannot co-exist`,
          );
        }
      }
    }
  }
}

/**
 * Computes a MongoDB update document ($set, $unset) representing the transition
 * from originalDoc to editedDoc according to docs/MONGODB_M4_SPEC.md §4.2.1.
 */
export function computeDocumentDiff(
  originalDoc: Record<string, any>,
  editedDoc: Record<string, any>,
): DocumentDiffResult {
  if (!originalDoc || typeof originalDoc !== "object" || Array.isArray(originalDoc)) {
    throw new Error("INVALID_DOCUMENT: originalDoc must be an object");
  }
  if (!editedDoc || typeof editedDoc !== "object" || Array.isArray(editedDoc)) {
    throw new Error("INVALID_DOCUMENT: editedDoc must be an object");
  }

  // 1. Strict _id immutability check (§4.2.1 Rule 8)
  if (originalDoc._id !== undefined) {
    if (editedDoc._id === undefined || !deepEqual(originalDoc._id, editedDoc._id)) {
      throw new Error("ID_MODIFICATION_PROHIBITED: _id is immutable and cannot be updated");
    }
  }

  const $set: Record<string, any> = {};
  const $unset: Record<string, ""> = {};

  function traverse(orig: Record<string, any>, edit: Record<string, any>, prefix: string) {
    const origKeys = new Set(Object.keys(orig));
    const editKeys = new Set(Object.keys(edit));

    // Handle keys deleted in edit (missing vs null, §4.2.1 Rule 3 & 5)
    for (const key of origKeys) {
      if (prefix === "" && key === "_id") continue;
      validateKey(key);

      if (!editKeys.has(key)) {
        const path = prefix ? `${prefix}.${key}` : key;
        $unset[path] = "";
      }
    }

    // Handle keys in edit (added or modified)
    for (const key of editKeys) {
      if (prefix === "" && key === "_id") continue;
      validateKey(key);

      const path = prefix ? `${prefix}.${key}` : key;
      const editVal = edit[key];

      if (!origKeys.has(key)) {
        // Brand new key
        $set[path] = editVal;
        continue;
      }

      const origVal = orig[key];

      // If identical, no-op
      if (deepEqual(origVal, editVal)) {
        continue;
      }

      // Arrays are atomic units (§4.2.1 Rule 4)
      if (Array.isArray(origVal) || Array.isArray(editVal)) {
        $set[path] = editVal;
        continue;
      }

      // EJSON scalar tagged types are atomic units (§4.2.1 Rule 7)
      if (isEjsonScalar(origVal) || isEjsonScalar(editVal)) {
        $set[path] = editVal;
        continue;
      }

      // Type-shift: Object to scalar/null or scalar to object (§4.2.1 Rule 2)
      const origIsObj = isPlainObject(origVal);
      const editIsObj = isPlainObject(editVal);

      if (origIsObj !== editIsObj) {
        $set[path] = editVal;
        continue;
      }

      // Both are plain objects
      if (origIsObj && editIsObj) {
        // If edited object is empty {} while original was not empty (§4.2.1 Rule 6)
        if (Object.keys(editVal).length === 0 && Object.keys(origVal).length > 0) {
          $set[path] = {};
        } else {
          traverse(origVal, editVal, path);
        }
        continue;
      }

      // Primitive scalar values
      $set[path] = editVal;
    }
  }

  traverse(originalDoc, editedDoc, "");

  // Prevent conflicting parent/child paths (§4.2.1 Rule 9)
  const allPaths = [...Object.keys($set), ...Object.keys($unset)];
  assertNoPathCollisions(allPaths);

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;

  if (!hasSet && !hasUnset) {
    return { hasChanges: false };
  }

  return {
    hasChanges: true,
    updateDoc: {
      ...(hasSet ? { $set } : {}),
      ...(hasUnset ? { $unset } : {}),
    },
  };
}

/**
 * React hook wrapping computeDocumentDiff.
 */
export function useDocumentDiff(
  originalDoc: Record<string, any> | null | undefined,
  editedDoc: Record<string, any> | null | undefined,
): DocumentDiffResult {
  return useMemo(() => {
    if (!originalDoc || !editedDoc) {
      return { hasChanges: false };
    }
    try {
      return computeDocumentDiff(originalDoc, editedDoc);
    } catch {
      return { hasChanges: false };
    }
  }, [originalDoc, editedDoc]);
}
