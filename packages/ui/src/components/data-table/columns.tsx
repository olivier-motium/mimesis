/**
 * TanStack Table column definitions for sessions DataTable
 *
 * Consolidated layout:
 * | Status (40px) | Mission (flex) | Actions (60px) |
 *
 * Mission column shows: Mission title + Now + Last + Updated
 */

import type { ColumnDef } from "@tanstack/react-table"
import type { Session, SessionStatus } from "@/types/schema"
import { getEffectiveStatus } from "@/lib/sessionStatus"
import { StatusCell } from "./cells/StatusCell"
import { MissionCell } from "./cells/MissionCell"
import { ActionsCell } from "./cells/ActionsCell"

// Status priority for sorting
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  working: 0,
  waiting: 1,
  idle: 2,
}

export const columns: ColumnDef<Session>[] = [
  // Status indicator - 40px
  {
    id: "status",
    accessorFn: (row) => getEffectiveStatus(row).status,
    header: () => <span className="text-muted-foreground">●</span>,
    cell: ({ row }) => <StatusCell session={row.original} />,
    size: 40,
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const statusA = getEffectiveStatus(rowA.original).status
      const statusB = getEffectiveStatus(rowB.original).status
      return STATUS_PRIORITY[statusA] - STATUS_PRIORITY[statusB]
    },
  },

  // Mission - consolidated column (flex grow)
  // Shows: Mission title + Now + Last + Updated + branch/repo chips
  {
    id: "mission",
    accessorFn: (row) => row.workChainName ?? row.originalPrompt ?? "",
    header: () => <span className="text-muted-foreground text-xs">Mission</span>,
    cell: ({ row }) => <MissionCell session={row.original} />,
    enableSorting: true,
  },

  // Actions menu - 60px
  {
    id: "actions",
    header: () => <span className="text-muted-foreground text-xs">Actions</span>,
    cell: ({ row }) => <ActionsCell session={row.original} />,
    size: 60,
    enableSorting: false,
  },
]
