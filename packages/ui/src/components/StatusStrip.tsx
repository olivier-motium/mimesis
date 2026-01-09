/**
 * StatusStrip - Compact status overview with clickable filters
 *
 * Shows counts of sessions by status (Working, Waiting, Idle, etc.)
 * Clicking a badge filters the OpsTable to that status.
 */

import { Flex, Badge, Text } from "@radix-ui/themes";
import type { StatusCounts, StatusFilter } from "./ops-table/types";

interface StatusStripProps {
  counts: StatusCounts;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

export function StatusStrip({ counts, activeFilter, onFilterChange }: StatusStripProps) {
  const badges: Array<{
    filter: StatusFilter;
    label: string;
    count: number;
    color: "green" | "orange" | "red" | "gray" | "blue";
  }> = [
    { filter: "all", label: "All", count: counts.all, color: "blue" },
    { filter: "working", label: "Working", count: counts.working, color: "green" },
    { filter: "waiting", label: "Needs Input", count: counts.waiting, color: "orange" },
    { filter: "idle", label: "Idle", count: counts.idle, color: "gray" },
  ];

  // Only show error/stale badges if there are any
  if (counts.error > 0) {
    badges.push({ filter: "error", label: "Errors", count: counts.error, color: "red" });
  }
  if (counts.stale > 0) {
    badges.push({ filter: "stale", label: "Stale", count: counts.stale, color: "orange" });
  }

  return (
    <Flex gap="2" align="center" wrap="wrap">
      {badges.map(({ filter, label, count, color }) => {
        // "Needs Input" badge pulses when there are sessions waiting
        const needsAttention = filter === "waiting" && count > 0 && activeFilter !== "waiting";

        return (
          <Badge
            key={filter}
            color={color}
            variant={activeFilter === filter ? "solid" : "soft"}
            size="2"
            highContrast={activeFilter === filter || needsAttention}
            className={needsAttention ? "needs-attention-badge" : undefined}
            style={{
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontWeight: activeFilter === filter || needsAttention ? 600 : 500,
            }}
            onClick={() => onFilterChange(filter)}
          >
            {label}: {count}
          </Badge>
        );
      })}
    </Flex>
  );
}
