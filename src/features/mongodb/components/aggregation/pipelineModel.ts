import { SupportedStageType, PipelineStageItem } from "./types";
import { STAGE_DEFINITIONS } from "./stages/registry";

export function generateStageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createStageItem(type: SupportedStageType): PipelineStageItem {
  const def = STAGE_DEFINITIONS[type];
  const config = def ? def.createDefaultConfig() : {};
  let rawJson = "";

  if (type === "$raw") {
    rawJson = config.raw || '{\n  "$facet": {}\n}';
  } else if (def) {
    try {
      const serialized = def.serialize(config);
      rawJson = JSON.stringify({ [type]: serialized }, null, 2);
    } catch {
      rawJson = "{}";
    }
  }

  return {
    id: generateStageId(),
    type,
    enabled: true,
    isRaw: type === "$raw",
    rawJson,
    config,
    collapsed: false,
  };
}

export function duplicateStage(stage: PipelineStageItem): PipelineStageItem {
  return {
    ...JSON.parse(JSON.stringify(stage)),
    id: generateStageId(),
  };
}

export function toggleStageEnabled(
  stages: PipelineStageItem[],
  id: string,
): PipelineStageItem[] {
  return stages.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
}

export function toggleStageRaw(
  stages: PipelineStageItem[],
  id: string,
): PipelineStageItem[] {
  return stages.map((s) => {
    if (s.id !== id) return s;
    const nextIsRaw = !s.isRaw;
    let nextRawJson = s.rawJson;
    if (nextIsRaw && !nextRawJson) {
      const def = STAGE_DEFINITIONS[s.type];
      if (def) {
        try {
          const serialized = def.serialize(s.config);
          nextRawJson = JSON.stringify({ [s.type]: serialized }, null, 2);
        } catch {
          nextRawJson = "{}";
        }
      }
    }
    return { ...s, isRaw: nextIsRaw, rawJson: nextRawJson };
  });
}

export function toggleStageCollapsed(
  stages: PipelineStageItem[],
  id: string,
): PipelineStageItem[] {
  return stages.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s));
}

export function updateStageConfig(
  stages: PipelineStageItem[],
  id: string,
  config: Record<string, any>,
): PipelineStageItem[] {
  return stages.map((s) => {
    if (s.id !== id) return s;
    const def = STAGE_DEFINITIONS[s.type];
    let rawJson = s.rawJson;
    if (def && !s.isRaw) {
      try {
        const serialized = def.serialize(config);
        rawJson = JSON.stringify({ [s.type]: serialized }, null, 2);
      } catch {
        // preserve existing rawJson
      }
    }
    return { ...s, config, rawJson };
  });
}

export function updateStageRawJson(
  stages: PipelineStageItem[],
  id: string,
  rawJson: string,
): PipelineStageItem[] {
  return stages.map((s) => (s.id === id ? { ...s, rawJson } : s));
}

export function deleteStage(
  stages: PipelineStageItem[],
  id: string,
): PipelineStageItem[] {
  return stages.filter((s) => s.id !== id);
}

export function reorderStages(
  stages: PipelineStageItem[],
  oldIndex: number,
  newIndex: number,
): PipelineStageItem[] {
  if (
    oldIndex < 0 ||
    oldIndex >= stages.length ||
    newIndex < 0 ||
    newIndex >= stages.length
  ) {
    return stages;
  }
  const result = [...stages];
  const [removed] = result.splice(oldIndex, 1);
  result.splice(newIndex, 0, removed);
  return result;
}

export function moveStageUp(
  stages: PipelineStageItem[],
  index: number,
): PipelineStageItem[] {
  if (index <= 0) return stages;
  return reorderStages(stages, index, index - 1);
}

export function moveStageDown(
  stages: PipelineStageItem[],
  index: number,
): PipelineStageItem[] {
  if (index >= stages.length - 1) return stages;
  return reorderStages(stages, index, index + 1);
}