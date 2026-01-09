/**
 * Dialog for renaming a work chain.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as api from "../lib/api";

interface RenameWorkChainDialogProps {
  workChainId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameWorkChainDialog({
  workChainId,
  currentName,
  open,
  onOpenChange,
}: RenameWorkChainDialogProps) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  // Reset name when dialog opens with new currentName
  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  const handleRename = async () => {
    setLoading(true);
    try {
      // Empty string means clear the name (send null)
      await api.renameWorkChain(workChainId, name.trim() || null);
      onOpenChange(false);
    } catch (e) {
      console.error("Rename failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRename();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename Work Chain</DialogTitle>
          <DialogDescription>
            Give this work chain a memorable name. Leave empty to use the default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., fix-auth-bug, refactor-api"
            autoFocus
            className="rename-dialog__input"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={loading}>
            {loading ? "Saving..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
