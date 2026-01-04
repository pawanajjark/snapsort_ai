import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FolderOpen, ChevronLeft, AlertTriangle, Image, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FileInfo {
  path: string;
  name: string;
  size: number;
  is_valid: boolean;
}

interface FolderInfo {
  path: string;
  name: string;
}

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  onSelectFolder: (path: string) => void;
  onStartScan: (path: string, selectedPaths: string[]) => void;
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
  const [folders, setFolders] = useState<FolderInfo[]>([]);
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
    setFolders([]);

    try {
      const [folderResults, fileResults] = await Promise.all([
        invoke<FolderInfo[]>("list_subfolders", { path: folderPath }),
        invoke<FileInfo[]>("list_folder_screenshots", { path: folderPath }),
      ]);
      setFolders(folderResults);
      setFiles(fileResults);
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
    const selectedPaths = validFiles.map((file) => file.path);
    onSelectFolder(folderPath);
    onOpenChange(false);
    onStartScan(folderPath, selectedPaths);
  }

  function getParentPath(path: string) {
    if (path === "/" || path.trim() === "") return path;
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash <= 0) return "/";
    return path.slice(0, lastSlash);
  }

  function handleUp() {
    const parent = getParentPath(folderPath);
    if (parent !== folderPath) {
      setFolderPath(parent);
    }
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

        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleUp}
              variant="outline"
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Up
            </Button>
            <div className="text-[12px] text-white/60 font-mono">
              {folderPath}
            </div>
          </div>
          <Button
            onClick={loadFolderContents}
            variant="outline"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            Refresh
          </Button>
        </div>

        {/* File preview area */}
        <div className="h-[420px] overflow-hidden flex">
          <div className="w-64 border-r border-white/5 overflow-y-auto">
            <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-white/40">
              Folders
            </div>
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="folders-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-3 text-[12px] text-white/40"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading folders...
                </motion.div>
              ) : folders.length === 0 ? (
                <motion.div
                  key="folders-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-3 text-[12px] text-white/30"
                >
                  No subfolders
                </motion.div>
              ) : (
                <motion.div
                  key="folders"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-1 px-2 pb-3"
                >
                  {folders.map((folder) => (
                    <button
                      key={folder.path}
                      onClick={() => setFolderPath(folder.path)}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
                        text-[12px] text-white/70 hover:bg-white/5
                      `}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-white/40" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
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
                  Looking for PNG files with "screenshot" in the name
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
            <FolderOpen className="w-4 h-4 mr-2" />
            Scan {validFiles.length} Files
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
