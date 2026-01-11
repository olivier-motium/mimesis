/**
 * StatusStrip - Attention-first status bar
 *
 * Reordered for operator workflow:
 * 1. Needs Input (highest attention)
 * 2. Errors
 * 3. Stale
 * 4. Running
 * 5. Idle (collapsible, lowest priority)
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusCounts, StatusFilter } from "./ops-table/types";

interface StatusStripProps {
  counts: StatusCounts;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  idleExpanded?: boolean;
  onIdleExpandedChange?: (expanded: boolean) => void;
}

const STATUS_STYLES: Record<string, { bg: string; bgActive: string; text: string; border: string; icon: string }> = {
  all: {
    bg: "bg-blue-500/10",
    bgActive: "bg-blue-500",
    text: "text-blue-400",
    border: "border-blue-500/20",
    icon: "◉",
  },
  waiting: {
    bg: "bg-status-waiting/10",
    bgActive: "bg-status-waiting",
    text: "text-status-waiting",
    border: "border-status-waiting/20",
    icon: "!",
  },
  error: {
    bg: "bg-status-error/10",
    bgActive: "bg-status-error",
    text: "text-status-error",
    border: "border-status-error/20",
    icon: "✖",
  },
  stale: {
    bg: "bg-orange-500/10",
    bgActive: "bg-orange-500",
    text: "text-orange-400",
    border: "border-orange-500/20",
    icon: "⚠",
  },
  working: {
    bg: "bg-status-working/10",
    bgActive: "bg-status-working",
    text: "text-status-working",
    border: "border-status-working/20",
    icon: "●",
  },
  idle: {
    bg: "bg-status-idle/10",
    bgActive: "bg-status-idle",
    text: "text-status-idle",
    border: "border-status-idle/20",
    icon: "○",
  },
};

export function StatusStrip({
  counts,
  activeFilter,
  onFilterChange,
  idleExpanded = false,
  onIdleExpandedChange,
}: StatusStripProps) {
  // Local state if not controlled
  const [localIdleExpanded, setLocalIdleExpanded] = useState(false);
  const isIdleExpanded = onIdleExpandedChange ? idleExpanded : localIdleExpanded;
  const setIdleExpanded = onIdleExpandedChange ?? setLocalIdleExpanded;

  // Attention-first ordering
  const primaryBadges: Array<{
    filter: StatusFilter;
    label: string;
    count: number;
    alwaysShow: boolean;
  }> = [
    { filter: "waiting", label: "Needs Input", count: counts.waiting, alwaysShow: true },
    { filter: "error", label: "Errors", count: counts.error, alwaysShow: false },
    { filter: "stale", label: "Stale", count: counts.stale, alwaysShow: false },
    { filter: "working", label: "Running", count: counts.working, alwaysShow: true },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All badge (always first for quick reset) */}
      <StatusBadge
        filter="all"
        label="All"
        count={counts.all}
        isActive={activeFilter === "all"}
        onClick={() => onFilterChange("all")}
      />

      {/* Attention badges (ordered by priority) */}
      {primaryBadges.map(({ filter, label, count, alwaysShow }) => {
        if (!alwaysShow && count === 0) return null;
        const needsAttention = filter === "waiting" && count > 0 && activeFilter !== "waiting";
        return (
          <StatusBadge
            key={filter}
            filter={filter}
            label={label}
            count={count}
            isActive={activeFilter === filter}
            needsAttention={needsAttention}
            onClick={() => onFilterChange(filter)}
          />
        );
      })}

      {/* Idle badge with expand/collapse toggle */}
      <button
        type="button"
        onClick={() => {
          if (activeFilter === "idle") {
            // Already filtering by idle, toggle expansion
            setIdleExpanded(!isIdleExpanded);
          } else {
            // Filter to idle
            onFilterChange("idle");
          }
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer",
          activeFilter === "idle"
            ? ["bg-status-idle", "text-white", "border-transparent"]
            : ["bg-status-idle/10", "text-status-idle", "border-status-idle/20", "hover:opacity-80"]
        )}
      >
        <span className="mr-0.5">○</span>
        Idle: {counts.idle}
        {isIdleExpanded ? (
          <ChevronDown className="w-3 h-3 ml-0.5" />
        ) : (
          <ChevronRight className="w-3 h-3 ml-0.5" />
        )}
      </button>
    </div>
  );
}

interface StatusBadgeProps {
  filter: StatusFilter;
  label: string;
  count: number;
  isActive: boolean;
  needsAttention?: boolean;
  onClick: () => void;
}

function StatusBadge({ filter, label, count, isActive, needsAttention, onClick }: StatusBadgeProps) {
  const styles = STATUS_STYLES[filter];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer",
        isActive
          ? [styles.bgActive, "text-white border-transparent"]
          : [styles.bg, styles.text, styles.border, "hover:opacity-80"],
        needsAttention && "animate-pulse"
      )}
    >
      <span className="mr-0.5">{styles.icon}</span>
      {label}: {count}
    </button>
  );
}
