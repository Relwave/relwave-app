export type SupportedStageType =
  | "$match"
  | "$project"
  | "$group"
  | "$sort"
  | "$limit"
  | "$skip"
  | "$lookup"
  | "$unwind"
  | "$addFields"
  | "$raw";

export interface PipelineStageItem {
  id: string; // unique UUID
  type: SupportedStageType;
  enabled: boolean;
  isRaw: boolean;
  rawJson: string;
  config: Record<string, any>;
  collapsed?: boolean;
}

export interface StageValidationError {
  stageId?: string;
  stageIndex?: number;
  message: string;
}

export interface PipelineValidationResult {
  isValid: boolean;
  errors: StageValidationError[];
}

export interface SamplePreviewSafety {
  allowed: boolean;
  blockingOperator?: string;
  reason?: string;
}

export interface StageEditorProps {
  stage: PipelineStageItem;
  onChange: (config: Record<string, any>) => void;
  collections?: string[];
}

export interface StageDefinition {
  type: SupportedStageType;
  label: string;
  description: string;
  createDefaultConfig: () => Record<string, any>;
  serialize: (config: Record<string, any>) => any;
  validate: (config: Record<string, any>) => string | null;
  component: React.ComponentType<StageEditorProps>;
}