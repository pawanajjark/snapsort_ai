import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { Loader2, AlertTriangle, Image, Check, Circle } from "lucide-react";

interface FileInfo {
  path: string;
  name: string;
  size: number;
  is_valid: boolean;
}

interface PreviewGridProps {
  files: FileInfo[];
  isLoading: boolean;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isReadOnly?: boolean;
  processedFiles?: Set<string>;
  hideProcessed?: boolean;
  showProcessedBadge?: boolean;
}

export function PreviewGrid({
  files,
  isLoading,
  selectedFiles,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  isReadOnly = false,
  processedFiles,
  hideProcessed = false,
  showProcessedBadge = true,
}: PreviewGridProps) {
  const visibleFiles = hideProcessed && processedFiles
    ? files.filter(f => !processedFiles.has(f.path))
    : files;
  const validFiles = visibleFiles.filter(f => f.is_valid);
  const skippedFiles = visibleFiles.filter(f => !f.is_valid);
  const allSelected = validFiles.length > 0 && validFiles.every(f => selectedFiles.has(f.path));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-white/40 animate-spin mb-3" />
        <p className="text-[13px] text-white/40">Loading screenshots...</p>
      </div>
    );
  }

  if (visibleFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Image className="w-7 h-7 text-white/20" />
        </div>
        <p className="text-[15px] text-white/50 font-medium">
          {files.length === 0 ? "No screenshots found" : "All selected files processed"}
        </p>
        <p className="text-[12px] text-white/30 mt-1">
          Looking for PNG files with "screenshot" in the name
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with stats and actions */}
      <div className="shrink-0 px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="text-white/60">
            {validFiles.length} screenshots ready
          </span>
          {skippedFiles.length > 0 && (
            <span className="text-amber-400/60 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {skippedFiles.length} over 5MB
            </span>
          )}
        </div>
        {!isReadOnly ? (
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-[12px] text-white/50 hover:text-white/70 transition-colors"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        ) : (
          <span className="text-[12px] text-white/30">Selections locked</span>
        )}
      </div>

      {/* Thumbnail grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-5 gap-3" data-preview-grid>
          {visibleFiles.map((file, index) => (
            <PreviewThumbnail
              key={file.path}
              file={file}
              index={index}
              isSelected={selectedFiles.has(file.path)}
              onToggle={() => {
                if (!isReadOnly) {
                  onToggleSelect(file.path);
                }
              }}
              isReadOnly={isReadOnly}
              isProcessed={processedFiles?.has(file.path) ?? false}
              showProcessedBadge={showProcessedBadge}
            />
          ))}
        </div>
      </div>

      {/* Selected count */}
      <div className="shrink-0 px-5 py-3 border-t border-white/5 text-center">
        <p className="text-[12px] text-white/40">
          {selectedFiles.size} of {validFiles.length} selected for scanning
        </p>
      </div>
    </div>
  );
}

function PreviewThumbnail({
  file,
  index,
  isSelected,
  onToggle,
  isReadOnly,
  isProcessed,
  showProcessedBadge,
}: {
  file: FileInfo;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  isReadOnly: boolean;
  isProcessed: boolean;
  showProcessedBadge: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const previewKey = encodeURIComponent(file.path);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: Math.min(index * 0.02, 0.5),
        duration: 0.2,
        ease: "easeOut",
      }}
      onClick={!isReadOnly && file.is_valid ? onToggle : undefined}
      data-preview-key={previewKey}
      className={`
        relative aspect-square rounded-xl overflow-hidden cursor-pointer
        border-2 transition-all duration-150
        ${!file.is_valid 
          ? "opacity-40 cursor-not-allowed border-amber-500/30" 
          : isSelected 
            ? "border-white/40 ring-2 ring-white/20" 
            : isReadOnly
              ? "border-transparent"
              : "border-transparent hover:border-white/20"
        }
      `}
    >
      {/* Loading state */}
      {!loaded && file.is_valid && (
        <div className="absolute inset-0 bg-white/5 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
        </div>
      )}

      {/* Thumbnail image */}
      <motion.img
        src={convertFileSrc(file.path)}
        alt={file.name}
        className="w-full h-full object-cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
      />

      {/* Selection indicator */}
      {file.is_valid && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: isSelected ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg"
        >
          <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />
        </motion.div>
      )}

      {showProcessedBadge && isProcessed && (
        <div className="absolute bottom-2 left-2 w-5 h-5 rounded-full bg-white/80 text-black flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </div>
      )}

      {/* Unselected circle indicator */}
      {file.is_valid && !isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white/30 bg-black/30" />
      )}

      {/* Skip indicator for oversized files */}
      {!file.is_valid && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
      )}

      {/* Hover overlay with filename */}
      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2"
      >
        <p className="text-[10px] text-white truncate w-full">
          {file.name}
        </p>
      </motion.div>
    </motion.div>
  );
}

// Helper to format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
