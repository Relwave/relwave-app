import { EJSONDocument } from "../../types";
import { PipelineStageItem } from "./types";
import { STAGE_DEFINITIONS } from "./stages/registry";

export function serializePipeline(stages: PipelineStageItem[]): EJSONDocument[] {
  const result: EJSONDocument[] = [];

  for (const stage of stages) {
    if (!stage.enabled) continue;

    if (stage.type === "$raw" || stage.isRaw) {
      const trimmed = (stage.rawJson || "").trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed);

      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length > 0 && keys[0].startsWith("$")) {
          result.push(parsed);
        } else if (stage.type !== "$raw") {
          result.push({ [stage.type]: parsed });
        } else {
          result.push(parsed);
        }
      } else {
        if (stage.type !== "$raw") {
          result.push({ [stage.type]: parsed });
        } else {
          result.push(parsed);
        }
      }
    } else {
      const def = STAGE_DEFINITIONS[stage.type];
      if (def) {
        const serializedBody = def.serialize(stage.config);
        result.push({ [stage.type]: serializedBody });
      }
    }
  }

  return result;
}

export function formatPipelineScript(collection: string, stages: PipelineStageItem[]): string {
  const serialized = serializePipeline(stages);
  const collRef = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collection)
    ? `db.${collection || "collection"}`
    : `db.collection("${collection || "collection"}")`;

  if (serialized.length === 0) {
    return `${collRef}.aggregate([])`;
  }

  const jsonStages = JSON.stringify(serialized, null, 2);
  return `${collRef}.aggregate(${jsonStages})`;
}
