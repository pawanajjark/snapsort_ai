import { useMemo, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ConflictItem {
  id: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  destination: string;
  reasons: string[];
}

interface ConflictDialogProps {
  open: boolean;
  conflicts: ConflictItem[];
  overwriteIds: Set<string>;
  onRename: (id: string, nextName: string) => void;
  onSkip: (id: string) => void;
  onToggleOverwrite: (id: string) => void;
  onProceed: () => void;
  onClose: () => void;
}

export function ConflictDialog({
  open,
  conflicts,
  overwriteIds,
  onRename,
  onSkip,
  onToggleOverwrite,
  onProceed,
  onClose,
}: ConflictDialogProps) {
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});

  const currentValues = useMemo(() => {
    const map: Record<string, string> = {};
    conflicts.forEach((conflict) => {
      map[conflict.id] = renameValues[conflict.id] ?? conflict.proposed_name;
    });
    return map;
  }, [conflicts, renameValues]);

  function handleRename(id: string) {
    const nextName = currentValues[id]?.trim();
    if (!nextName) return;
    onRename(id, nextName);
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-3xl bg-[#0a0a0a] border-white/10 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b border-white/5">
          <DialogTitle className="text-white text-[15px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Resolve Conflicts
          </DialogTitle>
          <DialogDescription className="text-white/40 text-[13px]">
            Some files would overwrite existing items or collide with each other.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[520px]">
          <div className="px-6 py-5 space-y-4">
            {conflicts.map((conflict) => {
              const renameValue = currentValues[conflict.id] ?? conflict.proposed_name;
              return (
                <div
                  key={conflict.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[13px] text-white/80 font-medium">
                        {conflict.original_name}
                      </p>
                      <p className="text-[11px] text-white/30 mt-1">
                        {conflict.destination}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-[11px] bg-transparent border-white/10 text-white/60 hover:bg-white/5"
                        onClick={() => onSkip(conflict.id)}
                      >
                        Skip
                      </Button>
                      <Button
                        variant="outline"
                        className={`h-7 px-2 text-[11px] border-white/10 ${
                          overwriteIds.has(conflict.id)
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-transparent text-white/60 hover:bg-white/5"
                        }`}
                        onClick={() => onToggleOverwrite(conflict.id)}
                      >
                        Overwrite
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {conflict.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-300"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Input
                      value={renameValue}
                      onChange={(e) =>
                        setRenameValues((prev) => ({
                          ...prev,
                          [conflict.id]: e.target.value,
                        }))
                      }
                      className="bg-white/5 border-white/10 text-white text-[12px] font-mono"
                    />
                    <Button
                      className="h-8 px-3 text-[12px] bg-white text-black hover:bg-white/90"
                      onClick={() => handleRename(conflict.id)}
                    >
                      Rename
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
          <div className="text-[12px] text-white/40">
            {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} remaining
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="border-white/10 bg-transparent text-white/60 hover:bg-white/5"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="bg-white text-black hover:bg-white/90"
              onClick={onProceed}
              disabled={conflicts.length > 0}
            >
              <Check className="w-3.5 h-3.5 mr-2" />
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
