import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

interface EditModalProps {
  file: FileProposal | null;
  categories: string[];
  onSave: (id: string, name: string, category: string) => void;
  onClose: () => void;
}

export function EditModal({ file, categories, onSave, onClose }: EditModalProps) {
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");

  useEffect(() => {
    if (file) {
      setEditName(file.proposed_name);
      setEditCategory(file.proposed_category);
    }
  }, [file]);

  const handleSave = () => {
    if (file) {
      onSave(file.id, editName, editCategory);
      onClose();
    }
  };

  // Get unique parent categories for quick selection
  const parentCategories = [...new Set(categories.map(c => c.split('/')[0]))];

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-md bg-[#111111] border border-white/10 rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-[15px] font-semibold text-white">Edit File</h3>
              <motion.button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-white/5 text-white/40 hover:text-white/60"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* File Name */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                  File Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="
                    bg-white/5 border-white/10 text-white text-[13px]
                    focus:border-white/20 focus:ring-1 focus:ring-white/10
                  "
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                  Category / Folder Path
                </label>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Finance/Receipts"
                  className="
                    bg-white/5 border-white/10 text-white text-[13px] font-mono
                    placeholder:text-white/20
                    focus:border-white/20 focus:ring-1 focus:ring-white/10
                  "
                />
                <p className="text-[11px] text-white/30">
                  Use forward slashes for nested folders
                </p>
              </div>

              {/* Quick Category Selection */}
              {parentCategories.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                    Quick Select
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {parentCategories.slice(0, 6).map((cat) => (
                      <motion.button
                        key={cat}
                        onClick={() => setEditCategory(cat)}
                        className={`
                          px-3 py-1.5 rounded-lg text-[12px] font-medium
                          transition-colors duration-100
                          ${editCategory === cat || editCategory.startsWith(cat + '/')
                            ? 'bg-white text-black'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }
                        `}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {cat}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-white/5">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 bg-transparent border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1 bg-white text-black hover:bg-white/90"
              >
                Save Changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

