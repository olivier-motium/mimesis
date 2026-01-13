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

import { cn } from "@/lib/utils";
import type { StatusCounts, StatusFilter } from "./ops-table/types";

interface StatusStripProps {
  counts: StatusCounts;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

// Minimal status styles - no icons, just subtle color coding
const STATUS_STYLES: Record<string, { bg: string; bgActive: string; text: string; border: string }> = {
  all: {
    bg: "bg-transparent",
    bgActive: "bg-zinc-600/40",
    text: "text-zinc-400",
    border: "border-transparent",
  },
  waiting: {
    bg: "bg-transparent",
    bgActive: "bg-status-waiting/30",
    text: "text-status-waiting",
    border: "border-transparent",
  },
  error: {
    bg: "bg-transparent",
    bgActive: "bg-status-error/30",
    text: "text-status-error",
    border: "border-transparent",
  },
  stale: {
    bg: "bg-transparent",
    bgActive: "bg-amber-600/30",
    text: "text-amber-500",
    border: "border-transparent",
  },
  working: {
    bg: "bg-transparent",
    bgActive: "bg-status-working/30",
    text: "text-status-working",
    border: "border-transparent",
  },
  idle: {
    bg: "bg-transparent",
    bgActive: "bg-status-idle/30",
    text: "text-status-idle",
    border: "border-transparent",
  },
};

export function StatusStrip({
  counts,
  activeFilter,
  onFilterChange,
}: StatusStripProps) {
  // Attention-first ordering
  const primaryBadges: Array<{
    filter: StatusFilter;
    label: string;
    count: number;
    alwaysShow: boolean;
  }> = [
    { filter: "waiting", label: "Needs Input", count: counts.waiting, alwaysShow: true },
    { filter: "error", label: "Errors", count: counts.error, alwaysShow: false },
    { filter: "stale", label: "Slow", count: counts.stale, alwaysShow: false },
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

      {/* Idle badge - minimal */}
      <button
        type="button"
        onClick={() => onFilterChange("idle")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
          activeFilter === "idle"
            ? ["bg-status-idle/30", "text-status-idle"]
            : ["bg-transparent", "text-status-idle", "opacity-60 hover:opacity-100"]
        )}
      >
        {counts.idle}
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
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-all cursor-pointer",
        isActive
          ? [styles.bgActive, styles.text]
          : [styles.bg, styles.text, "opacity-60 hover:opacity-100"]
      )}
    >
      {count}
    </button>
  );
}
