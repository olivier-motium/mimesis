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
 * Strip system tags and their content from text for cleaner display.
 * Removes <local-command-caveat>...</local-command-caveat>, <system-reminder>...</system-reminder>, etc.
 */
function stripSystemTags(text: string): string {
  return text
    // Remove system tags and their entire content
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replace(/<command-message>[\s\S]*?<\/command-message>/gi, "")
    .replace(/<command-name>[\s\S]*?<\/command-name>/gi, "")
    .replace(/<command-args>[\s\S]*?<\/command-args>/gi, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi, "")
    // Remove any remaining standalone tags
    .replace(/<[^>]+>/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim()
}

export function GoalCell({ session }: GoalCellProps) {
  const { fileStatusValue } = getEffectiveStatus(session)
  const rawText = session.goal || session.originalPrompt
  const cleanText = stripSystemTags(rawText)
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
