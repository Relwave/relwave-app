import { PipelineStageItem, PipelineValidationResult, SamplePreviewSafety } from "./types";
import { STAGE_DEFINITIONS } from "./stages/registry";

export const FORBIDDEN_WRITE_STAGES = new Set(["$out", "$merge"]);
export const FORBIDDEN_JS_OPERATORS = new Set(["$function", "$accumulator", "$where"]);

export const FIRST_STAGE_ONLY_OPERATORS = new Set([
  "$geoNear",
  "$collStats",
  "$indexStats",
  "$search",
  "$searchMeta",
  "$vectorSearch",
]);

export function findForbiddenOperator(val: any, depth = 0): string | null {
  if (depth > 20 || !val || typeof val !== "object") return null;

  if (Array.isArray(val)) {
    for (const item of val) {
      const found = findForbiddenOperator(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [k, v] of Object.entries(val)) {
    if (FORBIDDEN_JS_OPERATORS.has(k)) {
      return k;
    }
    const found = findForbiddenOperator(v, depth + 1);
    if (found) return found;
  }

  return null;
}

export function validatePipeline(stages: PipelineStageItem[]): PipelineValidationResult {
  const errors: Array<{ stageId?: string; stageIndex?: number; message: string }> = [];
  const enabledStages = stages.filter((s) => s.enabled);

  if (enabledStages.length === 0) {
    return {
      isValid: false,
      errors: [{ message: "Pipeline must contain at least one enabled stage." }],
    };
  }

  stages.forEach((stage, index) => {
    if (!stage.enabled) return;

    if (stage.type === "$raw" || stage.isRaw) {
      const rawTrimmed = (stage.rawJson || "").trim();
      if (!rawTrimmed) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1} (${stage.type}): Raw JSON cannot be empty.`,
        });
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawTrimmed);
      } catch (err: any) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1} (${stage.type}): Invalid JSON syntax - ${err.message}`,
        });
        return;
      }

      if (typeof parsed !== "object" || parsed === null) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1} (${stage.type}): Stage definition must be an object.`,
        });
        return;
      }

      if (stage.type === "$raw") {
        const keys = Object.keys(parsed);
        if (keys.length === 0) {
          errors.push({
            stageId: stage.id,
            stageIndex: index,
            message: `Stage ${index + 1} ($raw): Stage object must contain at least one operator key.`,
          });
          return;
        }
        for (const k of keys) {
          if (!k.startsWith("$")) {
            errors.push({
              stageId: stage.id,
              stageIndex: index,
              message: `Stage ${index + 1} ($raw): Operator key '${k}' must begin with '$'.`,
            });
          }
          if (FORBIDDEN_WRITE_STAGES.has(k)) {
            errors.push({
              stageId: stage.id,
              stageIndex: index,
              message: `Stage ${index + 1} ($raw): Write stage '${k}' is forbidden in read-only queries.`,
            });
          }
        }
      }

      const forbiddenOp = findForbiddenOperator(parsed);
      if (forbiddenOp) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1} (${stage.type}): Operator '${forbiddenOp}' is forbidden (arbitrary JavaScript execution is not permitted).`,
        });
      }
    } else {
      const def = STAGE_DEFINITIONS[stage.type];
      if (!def) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1}: Unsupported stage operator '${stage.type}'.`,
        });
        return;
      }

      const stageError = def.validate(stage.config);
      if (stageError) {
        errors.push({
          stageId: stage.id,
          stageIndex: index,
          message: `Stage ${index + 1} (${stage.type}): ${stageError}`,
        });
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function canPrependSample(stages: PipelineStageItem[]): SamplePreviewSafety {
  const enabledStages = stages.filter((s) => s.enabled);
  if (enabledStages.length === 0) return { allowed: true };

  const firstStage = enabledStages[0];
  let firstStageOp: string | undefined = firstStage.type;

  if (firstStage.type === "$raw" || firstStage.isRaw) {
    try {
      const parsed = JSON.parse(firstStage.rawJson || "{}");
      if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        if (keys.length > 0 && keys[0].startsWith("$")) {
          firstStageOp = keys[0];
        }
      }
    } catch {
      // ignore parse error here, validation handles it
    }
  }

  if (firstStageOp && FIRST_STAGE_ONLY_OPERATORS.has(firstStageOp)) {
    return {
      allowed: false,
      blockingOperator: firstStageOp,
      reason: `Sampled preview is unavailable because ${firstStageOp} must be the first stage in the pipeline. Run the intermediate preview directly with $limit: 10.`,
    };
  }

  return { allowed: true };
}