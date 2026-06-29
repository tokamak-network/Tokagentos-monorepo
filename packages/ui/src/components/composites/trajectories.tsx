/**
 * Trajectory visualisation composites.
 *
 * NOTE: minimal placeholders — the rich pipeline-graph / call-card / sidebar-item
 * implementations are pending. The exported types match the contracts consumed by
 * app-core's TrajectoriesView / TrajectoryDetailView, so the trajectory pages
 * compile and render their surrounding chrome (the visual nodes/cards are empty
 * until the real components land).
 */
import type { LucideIcon } from "lucide-react";

/** Pipeline stage identifiers: input → should_respond → plan → actions → evaluators. */
export type PipelineStageId =
  | "input"
  | "should_respond"
  | "plan"
  | "actions"
  | "evaluators";

export interface PipelineNode {
  id: PipelineStageId;
  label: string;
  callCount: number;
  status: "active" | "error" | "skipped";
  icon: LucideIcon;
}

export interface TrajectoryPipelineGraphProps {
  nodes?: PipelineNode[];
  activeStage?: PipelineStageId | null;
  onStageClick?: (stageId: PipelineStageId) => void;
  [key: string]: unknown;
}

export function TrajectoryPipelineGraph(_props: TrajectoryPipelineGraphProps) {
  return null;
}

export interface TrajectoryLlmCallCardProps {
  onCopy?: (content: string) => void;
  [key: string]: unknown;
}

export function TrajectoryLlmCallCard(_props: TrajectoryLlmCallCardProps) {
  return null;
}

export interface TrajectorySidebarItemProps {
  active?: boolean;
  onSelect?: () => void;
  callCount?: number;
  [key: string]: unknown;
}

export function TrajectorySidebarItem(_props: TrajectorySidebarItemProps) {
  return null;
}
