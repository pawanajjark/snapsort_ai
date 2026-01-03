import { motion, AnimatePresence } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, Circle, Pencil, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

interface FileCardProps {
  file: FileProposal;
  index: number;
  isPreviewActive: boolean;
  onSelect: () => void;
  onToggleSelection: () => void;
  onEdit: () => void;
  isExiting?: boolean;
}

export function FileCard({
  file,
  index,
  isPreviewActive,
  onSelect,
  onToggleSelection,
  onEdit,
  isExiting = false,
}: FileCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ 
        opacity: isExiting ? 0 : 1, 
        y: 0,
        x: isExiting ? -50 : 0,
        scale: isExiting ? 0.95 : 1,
      }}
      exit={{ opacity: 0, x: -50, scale: 0.95 }}
      transition={{ 
        duration: 0.2, 
        delay: isExiting ? 0 : index * 0.03,
        ease: "easeOut"
      }}
      onClick={onSelect}
      className={`
        group relative flex items-start gap-4 p-4 rounded-xl cursor-pointer
        border transition-colors duration-100
        ${file.selected 
          ? 'bg-white/[0.03] border-white/10' 
          : 'bg-transparent border-transparent opacity-50'
        }
        ${isPreviewActive 
          ? 'ring-1 ring-white/20' 
          : 'hover:bg-white/[0.02] hover:border-white/5'
        }
      `}
    >
      {/* Checkbox */}
      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelection();
        }}
        className="shrink-0 mt-0.5"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        {file.selected ? (
          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
            <Check className="w-3 h-3 text-black" strokeWidth={3} />
          </div>
        ) : (
          <Circle className="w-5 h-5 text-white/30" />
        )}
      </motion.button>

      {/* Thumbnail */}
      <div className="w-20 h-14 rounded-lg bg-white/5 overflow-hidden shrink-0 border border-white/5 relative">
        {/* Loading spinner */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
          </div>
        )}
        <motion.img
          src={convertFileSrc(file.original_path)}
          alt=""
          className="w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* New filename */}
        <p className="text-[13px] font-medium text-white truncate">
          {file.proposed_name}
        </p>
        
        {/* Path */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[11px] text-white/30 truncate max-w-[120px]">
            {file.original_name}
          </span>
          <ArrowRight className="w-3 h-3 text-white/20 shrink-0" />
          <span className="text-[11px] text-white/50 font-medium">
            {file.proposed_category}/
          </span>
        </div>

        {/* Reasoning */}
        <p className="text-[11px] text-white/30 mt-2 line-clamp-1 italic">
          {file.reasoning}
        </p>
      </div>

      {/* Edit Button */}
      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="
          shrink-0 p-2 rounded-lg
          opacity-0 group-hover:opacity-100
          bg-white/5 hover:bg-white/10
          text-white/40 hover:text-white/60
          transition-all duration-100
        "
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Pencil className="w-3.5 h-3.5" />
      </motion.button>

      {/* Exit animation overlay */}
      {isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-gradient-to-l from-transparent to-white/5 rounded-xl"
        />
      )}
    </motion.div>
  );
}

// File list container with AnimatePresence
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileListProps {
  files: FileProposal[];
  selectedFileId: string | null;
  exitingFileIds: Set<string>;
  onSelectFile: (file: FileProposal) => void;
  onToggleSelection: (id: string) => void;
  onEditFile: (file: FileProposal) => void;
}

export function FileList({
  files,
  selectedFileId,
  exitingFileIds,
  onSelectFile,
  onToggleSelection,
  onEditFile,
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
          <ArrowRight className="w-5 h-5 text-white/20" />
        </div>
        <p className="text-[13px] text-white/40">Select a folder</p>
        <p className="text-[11px] text-white/25 mt-1">to view its files</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-1">
        <AnimatePresence mode="popLayout">
          {files.map((file, index) => (
            <FileCard
              key={file.id}
              file={file}
              index={index}
              isPreviewActive={selectedFileId === file.id}
              isExiting={exitingFileIds.has(file.id)}
              onSelect={() => onSelectFile(file)}
              onToggleSelection={() => onToggleSelection(file.id)}
              onEdit={() => onEditFile(file)}
            />
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

