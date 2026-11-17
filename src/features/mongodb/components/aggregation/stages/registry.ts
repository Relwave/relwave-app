import { StageDefinition, SupportedStageType } from "../types";
import { MatchStageEditor } from "./MatchStageEditor";
import { ProjectStageEditor } from "./ProjectStageEditor";
import { GroupStageEditor } from "./GroupStageEditor";
import { SortStageEditor } from "./SortStageEditor";
import { LimitSkipStageEditor } from "./LimitSkipStageEditor";
import { LookupStageEditor } from "./LookupStageEditor";
import { UnwindStageEditor } from "./UnwindStageEditor";
import { AddFieldsStageEditor } from "./AddFieldsStageEditor";
import { RawStageEditor } from "./RawStageEditor";
import { findForbiddenOperator } from "../pipelineValidation";

export const STAGE_DEFINITIONS: Record<SupportedStageType, StageDefinition> = {
  $match: {
    type: "$match",
    label: "Match",
    description: "Filters documents to pass only those matching specified criteria",
    createDefaultConfig: () => ({
      filter: '{\n  "status": "active"\n}',
    }),
    serialize: (config) => {
      const raw = (config.filter || "").trim();
      if (!raw) return {};
      return JSON.parse(raw);
    },
    validate: (config) => {
      const raw = (config.filter || "").trim();
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return "Match filter must be a valid JSON object";
        }
        const forbidden = findForbiddenOperator(parsed);
        if (forbidden) return `Operator '${forbidden}' is forbidden`;
        return null;
      } catch (err: any) {
        return `Invalid JSON filter: ${err.message}`;
      }
    },
    component: MatchStageEditor,
  },

  $project: {
    type: "$project",
    label: "Project",
    description: "Reshapes documents by including, excluding, or computing fields",
    createDefaultConfig: () => ({
      fields: [
        { field: "name", value: 1 },
        { field: "email", value: 1 },
      ],
    }),
    serialize: (config) => {
      const result: Record<string, any> = {};
      const fields = config.fields || [];
      for (const item of fields) {
        if (!item.field) continue;
        if (item.value === 0 || item.value === 1) {
          result[item.field] = item.value;
        } else if (typeof item.value === "string") {
          try {
            result[item.field] = JSON.parse(item.value);
          } catch {
            result[item.field] = item.value;
          }
        } else {
          result[item.field] = item.value;
        }
      }
      return result;
    },
    validate: (config) => {
      const fields = config.fields || [];
      if (!Array.isArray(fields) || fields.length === 0) {
        return "At least one projection field is required";
      }
      for (const item of fields) {
        if (!item.field || typeof item.field !== "string" || !item.field.trim()) {
          return "Field name cannot be empty";
        }
        if (typeof item.value === "string" && item.value.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(item.value);
            const forbidden = findForbiddenOperator(parsed);
            if (forbidden) return `Expression operator '${forbidden}' is forbidden`;
          } catch (err: any) {
            return `Invalid expression JSON in field '${item.field}': ${err.message}`;
          }
        }
      }
      return null;
    },
    component: ProjectStageEditor,
  },

  $group: {
    type: "$group",
    label: "Group",
    description: "Groups input documents by identifier expression and computes accumulators",
    createDefaultConfig: () => ({
      idType: "field",
      idField: "$category",
      customId: "",
      accumulators: [{ name: "count", op: "$sum", expr: "1" }],
    }),
    serialize: (config) => {
      let _id: any = null;
      if (config.idType === "null") {
        _id = null;
      } else if (config.idType === "custom") {
        const raw = (config.customId || "").trim();
        try {
          _id = JSON.parse(raw);
        } catch {
          _id = raw;
        }
      } else {
        const field = (config.idField || "").trim();
        _id = field.startsWith("$") ? field : field ? `$${field}` : null;
      }

      const result: Record<string, any> = { _id };
      const accumulators = config.accumulators || [];
      for (const acc of accumulators) {
        if (!acc.name) continue;
        let exprVal: any = acc.expr;
        const trimmed = (acc.expr || "").trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
          exprVal = Number(trimmed);
        } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            exprVal = JSON.parse(trimmed);
          } catch {
            exprVal = trimmed;
          }
        }
        result[acc.name] = { [acc.op || "$sum"]: exprVal };
      }
      return result;
    },
    validate: (config) => {
      if (config.idType === "custom") {
        const raw = (config.customId || "").trim();
        if (!raw) return "Custom _id expression cannot be empty";
        if (raw.startsWith("{")) {
          try {
            const parsed = JSON.parse(raw);
            const forbidden = findForbiddenOperator(parsed);
            if (forbidden) return `_id operator '${forbidden}' is forbidden`;
          } catch (err: any) {
            return `Invalid custom _id JSON: ${err.message}`;
          }
        }
      } else if (config.idType === "field" && !(config.idField || "").trim()) {
        return "Group field path cannot be empty";
      }

      const accumulators = config.accumulators || [];
      for (const acc of accumulators) {
        if (!acc.name || !acc.name.trim()) {
          return "Accumulator output field name cannot be empty";
        }
        if (acc.op === "$accumulator") {
          return "Operator '$accumulator' is forbidden (arbitrary JavaScript execution is not permitted)";
        }
        if (acc.expr === undefined || acc.expr === "") {
          return `Expression for accumulator '${acc.name}' cannot be empty`;
        }
      }
      return null;
    },
    component: GroupStageEditor,
  },

  $sort: {
    type: "$sort",
    label: "Sort",
    description: "Reorders all input documents by the specified sort keys",
    createDefaultConfig: () => ({
      fields: [{ field: "createdAt", direction: -1 }],
    }),
    serialize: (config) => {
      const result: Record<string, 1 | -1> = {};
      const fields = config.fields || [];
      for (const f of fields) {
        if (f.field) {
          result[f.field] = f.direction === -1 ? -1 : 1;
        }
      }
      return result;
    },
    validate: (config) => {
      const fields = config.fields || [];
      if (!Array.isArray(fields) || fields.length === 0) {
        return "At least one sort field is required";
      }
      for (const f of fields) {
        if (!f.field || !f.field.trim()) {
          return "Sort field name cannot be empty";
        }
        if (f.direction !== 1 && f.direction !== -1) {
          return "Sort direction must be 1 (Ascending) or -1 (Descending)";
        }
      }
      return null;
    },
    component: SortStageEditor,
  },

  $limit: {
    type: "$limit",
    label: "Limit",
    description: "Passes the first n documents unmodified to the next stage",
    createDefaultConfig: () => ({ limit: 10 }),
    serialize: (config) => Number(config.limit),
    validate: (config) => {
      const val = Number(config.limit);
      if (!Number.isInteger(val) || val <= 0) {
        return "Limit must be a positive integer";
      }
      return null;
    },
    component: LimitSkipStageEditor,
  },

  $skip: {
    type: "$skip",
    label: "Skip",
    description: "Skips over the specified number of documents and passes the rest",
    createDefaultConfig: () => ({ skip: 0 }),
    serialize: (config) => Number(config.skip),
    validate: (config) => {
      const val = Number(config.skip);
      if (!Number.isInteger(val) || val < 0) {
        return "Skip must be a non-negative integer";
      }
      return null;
    },
    component: LimitSkipStageEditor,
  },

  $lookup: {
    type: "$lookup",
    label: "Lookup",
    description: "Performs a left outer join to another collection in the same database",
    createDefaultConfig: () => ({
      from: "orders",
      localField: "_id",
      foreignField: "userId",
      as: "orders",
    }),
    serialize: (config) => ({
      from: config.from || "",
      localField: config.localField || "",
      foreignField: config.foreignField || "",
      as: config.as || "",
    }),
    validate: (config) => {
      if (!(config.from || "").trim()) return "Foreign collection (from) is required";
      if (!(config.localField || "").trim()) return "Local field path is required";
      if (!(config.foreignField || "").trim()) return "Foreign field path is required";
      if (!(config.as || "").trim()) return "Output target field (as) is required";
      return null;
    },
    component: LookupStageEditor,
  },

  $unwind: {
    type: "$unwind",
    label: "Unwind",
    description:
      "Deconstructs an array field from the input documents to output a document for each element",
    createDefaultConfig: () => ({
      path: "$items",
      preserveNullAndEmptyArrays: false,
    }),
    serialize: (config) => {
      const pathVal = (config.path || "").trim();
      const path = pathVal.startsWith("$") ? pathVal : `$${pathVal}`;
      if (config.preserveNullAndEmptyArrays) {
        return {
          path,
          preserveNullAndEmptyArrays: true,
        };
      }
      return path;
    },
    validate: (config) => {
      if (!(config.path || "").trim()) return "Array field path is required";
      return null;
    },
    component: UnwindStageEditor,
  },

  $addFields: {
    type: "$addFields",
    label: "Add Fields",
    description: "Appends new fields or computes expressions without removing existing fields",
    createDefaultConfig: () => ({
      fields: [
        {
          key: "computedField",
          value: '{ "$concat": ["$firstName", " ", "$lastName"] }',
        },
      ],
    }),
    serialize: (config) => {
      const result: Record<string, any> = {};
      const fields = config.fields || [];
      for (const item of fields) {
        if (!item.key) continue;
        const valStr = (item.value || "").trim();
        try {
          result[item.key] = JSON.parse(valStr);
        } catch {
          result[item.key] = valStr;
        }
      }
      return result;
    },
    validate: (config) => {
      const fields = config.fields || [];
      if (!Array.isArray(fields) || fields.length === 0) {
        return "At least one field is required";
      }
      for (const item of fields) {
        if (!item.key || !item.key.trim()) return "Field key cannot be empty";
        const valStr = (item.value || "").trim();
        if (valStr.startsWith("{") || valStr.startsWith("[")) {
          try {
            const parsed = JSON.parse(valStr);
            const forbidden = findForbiddenOperator(parsed);
            if (forbidden) return `Operator '${forbidden}' is forbidden`;
          } catch (err: any) {
            return `Invalid JSON in field '${item.key}': ${err.message}`;
          }
        }
      }
      return null;
    },
    component: AddFieldsStageEditor,
  },

  $raw: {
    type: "$raw",
    label: "Raw Stage",
    description: "Freeform JSON editor for arbitrary MongoDB aggregation stages",
    createDefaultConfig: () => ({
      raw: '{\n  "$facet": {}\n}',
    }),
    serialize: (config) => {
      const raw = (config.raw || "").trim();
      if (!raw) return {};
      return JSON.parse(raw);
    },
    validate: (config) => {
      const raw = (config.raw || "").trim();
      if (!raw) return "Raw JSON cannot be empty";
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return "Raw stage must be an object";
        }
        const keys = Object.keys(parsed);
        if (keys.length === 0) return "Raw stage must define at least one operator";
        for (const k of keys) {
          if (!k.startsWith("$")) return `Operator '${k}' must start with '$'`;
          if (k === "$out" || k === "$merge") {
            return `Stage '${k}' is forbidden in read-only queries`;
          }
        }
        const forbidden = findForbiddenOperator(parsed);
        if (forbidden) return `Operator '${forbidden}' is forbidden`;
        return null;
      } catch (err: any) {
        return `Invalid JSON syntax: ${err.message}`;
      }
    },
    component: RawStageEditor,
  },
};
