import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FolderOpen, Search, AlertTriangle, Image, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileInfo {
  path: string;
  name: string;
  size: number;
  is_valid: boolean;
}

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  onSelectFolder: (path: string) => void;
  onStartScan: () => void;
}

export function FolderPicker({
  open,
  onOpenChange,
  currentPath,
  onSelectFolder,
  onStartScan,
}: FolderPickerProps) {
  const [folderPath, setFolderPath] = useState(currentPath);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load files when folder changes
  useEffect(() => {
    if (open && folderPath) {
      loadFolderContents();
    }
  }, [open, folderPath]);

  async function loadFolderContents() {
    setIsLoading(true);
    setError(null);
    setFiles([]);

    try {
      const result = await invoke<FileInfo[]>("list_folder_screenshots", {
        path: folderPath,
      });
      setFiles(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  const validFiles = files.filter((f) => f.is_valid);
  const skippedFiles = files.filter((f) => !f.is_valid);
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleScan() {
    onSelectFolder(folderPath);
    onOpenChange(false);
    onStartScan();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#0a0a0a] border-white/10 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b border-white/5">
          <DialogTitle className="text-white text-[15px] flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Select Folder
          </DialogTitle>
          <DialogDescription className="text-white/40 text-[13px]">
            Choose a folder to scan for screenshots
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 border-b border-white/5">
          <div className="flex gap-3">
            <Input
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/Users/you/Desktop"
              className="
                flex-1 bg-white/5 border-white/10 text-white text-[13px] font-mono
                placeholder:text-white/20
                focus:border-white/20 focus:ring-1 focus:ring-white/10
              "
            />
            <Button
              onClick={loadFolderContents}
              variant="outline"
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* File preview area */}
        <div className="h-[400px] overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <Loader2 className="w-8 h-8 text-white/40 animate-spin mb-3" />
                <p className="text-[13px] text-white/40">Loading files...</p>
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-[13px] text-red-400">{error}</p>
              </motion.div>
            ) : files.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                  <Image className="w-5 h-5 text-white/20" />
                </div>
                <p className="text-[13px] text-white/40">
                  No screenshots found
                </p>
                <p className="text-[11px] text-white/25 mt-1">
                  Looking for PNG files with "Screenshot" in the name
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Stats bar */}
                <div className="flex items-center justify-between mb-4 text-[12px]">
                  <div className="flex items-center gap-4">
                    <span className="text-white/60">
                      {validFiles.length} screenshots
                    </span>
                    {skippedFiles.length > 0 && (
                      <span className="text-amber-400/60 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {skippedFiles.length} over 5MB
                      </span>
                    )}
                  </div>
                  <span className="text-white/40">
                    Total: {formatSize(totalSize)}
                  </span>
                </div>

                {/* Thumbnail grid */}
                <div className="grid grid-cols-6 gap-3">
                  {files.map((file, index) => (
                    <motion.div
                      key={file.path}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: index * 0.02,
                        duration: 0.2,
                        ease: "easeOut",
                      }}
                      className={`
                        relative aspect-square rounded-lg overflow-hidden 
                        border ${file.is_valid ? "border-white/10" : "border-amber-500/30"}
                        group
                      `}
                    >
                      <img
                        src={convertFileSrc(file.path)}
                        alt={file.name}
                        className={`
                          w-full h-full object-cover
                          ${!file.is_valid ? "opacity-50" : ""}
                        `}
                      />
                      {!file.is_valid && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <p className="text-[10px] text-white truncate w-full">
                          {file.name}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
          <div className="text-[12px] text-white/40">
            {validFiles.length > 0 ? (
              <span>{validFiles.length} files ready for analysis</span>
            ) : (
              <span>No valid files to scan</span>
            )}
          </div>
          <Button
            onClick={handleScan}
            disabled={validFiles.length === 0}
            className="bg-white text-black hover:bg-white/90 font-medium disabled:opacity-50"
          >
            <Search className="w-4 h-4 mr-2" />
            Scan {validFiles.length} Files
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

