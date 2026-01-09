/**
 * GoalCell - Goal/prompt with status badges
 */

import { Badge } from "@/components/ui/badge"
import { getEffectiveStatus } from "@/lib/sessionStatus"
import type { Session } from "@/types/schema"

interface GoalCellProps {
  session: Session
}

/**
 * Strip XML-like tags from goal text for cleaner display.
 * Handles <command-message>, <local-command-caveat>, etc.
 */
function stripXmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, "") // Remove all XML-like tags
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
}

export function GoalCell({ session }: GoalCellProps) {
  const { fileStatusValue } = getEffectiveStatus(session)
  const rawText = session.goal || session.originalPrompt
  const cleanText = stripXmlTags(rawText)
  const displayText = cleanText.length > 60 ? cleanText.slice(0, 57) + "..." : cleanText

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="truncate text-sm">{displayText}</span>
      {fileStatusValue === "completed" && (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 shrink-0">
          Done
        </Badge>
      )}
      {fileStatusValue === "error" && (
        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 shrink-0">
          Error
        </Badge>
      )}
      {fileStatusValue === "blocked" && (
        <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20 shrink-0">
          Blocked
        </Badge>
      )}
    </div>
  )
}
