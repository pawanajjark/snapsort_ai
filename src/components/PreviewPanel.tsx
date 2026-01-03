import { motion, AnimatePresence } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X, Pencil, ArrowRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

interface PreviewPanelProps {
  file: FileProposal | null;
  onClose: () => void;
  onEdit: () => void;
}

export function PreviewPanel({ file, onClose, onEdit }: PreviewPanelProps) {
  return (
    <AnimatePresence mode="wait">
      {file && (
        <motion.div
          key={file.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="h-full flex flex-col bg-[var(--bg-secondary)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2 text-white/50">
              <ImageIcon className="w-4 h-4" />
              <span className="text-[13px] font-medium">Preview</span>
            </div>
            <motion.button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/5 text-white/40 hover:text-white/60"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Image Preview */}
              <motion.div 
                className="rounded-xl overflow-hidden bg-white/5 border border-white/5"
                layoutId={`preview-${file.id}`}
              >
                <img
                  src={convertFileSrc(file.original_path)}
                  alt=""
                  className="w-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '';
                    target.parentElement!.innerHTML = `
                      <div class="aspect-video flex items-center justify-center bg-white/5">
                        <svg class="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    `;
                  }}
                />
              </motion.div>

              {/* Original Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                  Original
                </label>
                <p className="text-[12px] font-mono text-white/50 break-all leading-relaxed">
                  {file.original_name}
                </p>
              </div>

              <div className="flex items-center gap-3 py-1">
                <Separator className="flex-1 bg-white/5" />
                <ArrowRight className="w-4 h-4 text-white/20" />
                <Separator className="flex-1 bg-white/5" />
              </div>

              {/* New Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                  New Name
                </label>
                <p className="text-[13px] font-semibold text-white">
                  {file.proposed_name}
                </p>
              </div>

              {/* Destination Path */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                  Destination
                </label>
                <div className="flex items-center gap-1 text-[13px]">
                  {file.proposed_category.split('/').map((part, index, arr) => (
                    <span key={index} className="flex items-center">
                      <span className={index === arr.length - 1 ? 'text-white' : 'text-white/50'}>
                        {part}
                      </span>
                      {index < arr.length - 1 && (
                        <span className="text-white/20 mx-1">/</span>
                      )}
                    </span>
                  ))}
                  <span className="text-white/20">/</span>
                </div>
              </div>

              {/* Reasoning */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                  AI Reasoning
                </label>
                <p className="text-[12px] text-white/40 italic leading-relaxed">
                  "{file.reasoning}"
                </p>
              </div>

              {/* Edit Button */}
              <Button
                onClick={onEdit}
                variant="outline"
                className="w-full mt-2 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white/70"
              >
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Edit Details
              </Button>
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

