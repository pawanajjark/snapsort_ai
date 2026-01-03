import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, FolderTree, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface SubcategoryDialogProps {
  open: boolean;
  category: string;
  current: number;
  total: number;
  recentFile?: string;
}

export function SubcategoryDialog({
  open,
  category,
  current,
  total,
  recentFile,
}: SubcategoryDialogProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  const isComplete = current >= total && total > 0;

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open}>
          <DialogContent className="max-w-md bg-[#0a0a0a] border-white/10 p-0 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <DialogHeader className="px-6 py-5 border-b border-white/5">
                <DialogTitle className="text-white text-[15px] flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: isComplete ? 0 : 360 }}
                    transition={{
                      duration: 2,
                      repeat: isComplete ? 0 : Infinity,
                      ease: "linear",
                    }}
                  >
                    {isComplete ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </motion.div>
                  {isComplete ? "Organization Complete" : "Organizing Files"}
                </DialogTitle>
                <DialogDescription className="text-white/40 text-[13px]">
                  {isComplete
                    ? `Created subcategories for ${category}`
                    : `AI is analyzing files in ${category}`}
                </DialogDescription>
              </DialogHeader>

              <div className="p-6 space-y-6">
                {/* Progress section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-white/60">
                      {isComplete ? "Completed" : "Analyzing"}
                    </span>
                    <span className="text-white font-mono">
                      {current}/{total}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${isComplete ? "bg-green-500" : "bg-white"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>

                  {/* Currently processing */}
                  <AnimatePresence mode="wait">
                    {recentFile && !isComplete && (
                      <motion.div
                        key={recentFile}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-2 text-[12px] text-white/40"
                      >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="truncate">{recentFile}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Visual animation */}
                <div className="flex items-center justify-center py-4">
                  <motion.div
                    className="relative w-24 h-24"
                    animate={isComplete ? {} : { rotate: 360 }}
                    transition={{
                      duration: 8,
                      repeat: isComplete ? 0 : Infinity,
                      ease: "linear",
                    }}
                  >
                    {/* Orbiting files */}
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute w-4 h-4 bg-white/10 rounded border border-white/20"
                        style={{
                          top: "50%",
                          left: "50%",
                          transformOrigin: "center",
                        }}
                        initial={{ x: -8, y: -8 }}
                        animate={
                          isComplete
                            ? { x: -8, y: -8, scale: 0 }
                            : {
                                x: Math.cos((i * Math.PI) / 2) * 40 - 8,
                                y: Math.sin((i * Math.PI) / 2) * 40 - 8,
                              }
                        }
                        transition={{
                          duration: isComplete ? 0.3 : 0,
                          delay: isComplete ? i * 0.1 : 0,
                        }}
                      />
                    ))}

                    {/* Center folder */}
                    <motion.div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      animate={isComplete ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.4 }}
                    >
                      <FolderTree
                        className={`w-10 h-10 ${isComplete ? "text-green-400" : "text-white/40"}`}
                      />
                    </motion.div>
                  </motion.div>
                </div>

                {/* Status message */}
                <motion.p
                  className="text-center text-[12px] text-white/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {isComplete
                    ? "Files have been organized into subcategories"
                    : "This may take a moment..."}
                </motion.p>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

