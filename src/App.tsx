import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Loader2, Check, Sparkles, FolderOpen, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FolderTree, buildFolderTree, type FolderNode } from "@/components/FolderTree";
import { FileList } from "@/components/FileCard";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsSheet } from "@/components/SettingsSheet";
import { EditModal } from "@/components/EditModal";
import { FolderPicker } from "@/components/FolderPicker";
import { SubcategoryDialog } from "@/components/SubcategoryDialog";
import { ScanVisualization, createMovingFiles } from "@/components/ScanVisualization";
import { PreviewGrid } from "@/components/PreviewGrid";
import { optimizeFolderStructure, shouldSubdivide, formatCategory } from "@/lib/categoryMerge";

interface PreviewFile {
  path: string;
  name: string;
  size: number;
  is_valid: boolean;
}

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

interface SkippedFile {
  name: string;
  size: number;
  reason: string;
}

function App() {
  // Settings
  const [apiKey, setApiKey] = useState("**REMOVED**");
  const [path, setPath] = useState("/Users/pawan/Desktop");
  const [showSettings, setShowSettings] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  // Skipped files (over 5MB)
  const [skippedFiles, setSkippedFiles] = useState<SkippedFile[]>([]);
  const [showSkippedNotice, setShowSkippedNotice] = useState(false);

  // Preview state (before scanning)
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<Set<string>>(new Set());
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(true);
  const [hasScanned, setHasScanned] = useState(false);

  // Data
  const [proposals, setProposals] = useState<FileProposal[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileProposal | null>(null);
  const [editingFile, setEditingFile] = useState<FileProposal | null>(null);

  // Animation state for file movement
  const [exitingFileIds, setExitingFileIds] = useState<Set<string>>(new Set());
  const [isAccepting, setIsAccepting] = useState(false);
  const [showScanViz, setShowScanViz] = useState(false);
  const [movingFiles, setMovingFiles] = useState<ReturnType<typeof createMovingFiles>>([]);

  // Auto-subcategorization state
  const [isSubcategorizing, setIsSubcategorizing] = useState(false);
  const [subcatCategory, setSubcatCategory] = useState("");
  const [subcatCurrent, setSubcatCurrent] = useState(0);
  const [subcatTotal, setSubcatTotal] = useState(0);
  const [subcatRecentFile, setSubcatRecentFile] = useState("");

  // Build folder tree from proposals
  const { folderTree, categoryList, fileCounts } = useMemo(() => {
    const categories = [...new Set(proposals.map(p => p.proposed_category))];
    const counts: Record<string, { total: number; selected: number }> = {};

    categories.forEach(cat => {
      const files = proposals.filter(p => p.proposed_category === cat);
      counts[cat] = {
        total: files.length,
        selected: files.filter(f => f.selected).length,
      };
    });

    const tree = buildFolderTree(categories, counts);
    return { folderTree: tree, categoryList: categories, fileCounts: counts };
  }, [proposals]);

  // Files in selected category
  const filesInSelectedCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return proposals.filter(p =>
      p.proposed_category === selectedCategory ||
      p.proposed_category.startsWith(selectedCategory + '/')
    );
  }, [proposals, selectedCategory]);

  const selectedCount = proposals.filter(p => p.selected).length;
  const totalCount = proposals.length;

  // Event listeners
  useEffect(() => {
    if (!invoke || !listen) return;

    const u1 = listen("scan-summary", (e: any) => {
      setTotalFiles(e.payload as number);
      setProcessedFiles(0);
    });

    const u2 = listen("file-proposed", (e: any) => {
      const rawProposal = e.payload;
      // Just format the category, no complex mapping
      const proposal = {
        ...rawProposal,
        proposed_category: formatCategory(rawProposal.proposed_category),
        selected: true
      };
      setProposals(prev => [...prev, proposal]);
      setProcessedFiles(prev => prev + 1);
    });

    const u3 = listen("file-skipped", (e: any) => {
      const skipped = e.payload as SkippedFile;
      setSkippedFiles(prev => [...prev, skipped]);
      setShowSkippedNotice(true);
      // Auto-hide notice after 3 seconds
      setTimeout(() => setShowSkippedNotice(false), 3000);
    });

    return () => {
      u1.then(f => f());
      u2.then(f => f());
      u3.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (!invoke || !listen) return;
    const u4 = listen("file-failed", (e: any) => {
      console.log("File processing failed:", e.payload);
      setProcessedFiles(prev => prev + 1);
    });
    return () => {
      u4.then(f => f());
    };
  }, []);

  // Auto-load desktop thumbnails on mount
  useEffect(() => {
    loadPreviewFiles();
  }, []);

  // Reload previews when path changes
  useEffect(() => {
    if (!hasScanned) {
      loadPreviewFiles();
    }
  }, [path]);

  async function loadPreviewFiles() {
    setIsLoadingPreviews(true);
    try {
      const files = await invoke<PreviewFile[]>("list_folder_screenshots", { path });
      setPreviewFiles(files);
      // Auto-select all valid files
      const validPaths = files.filter(f => f.is_valid).map(f => f.path);
      setSelectedPreviews(new Set(validPaths));
    } catch (e) {
      console.error("Failed to load preview files:", e);
      setPreviewFiles([]);
    } finally {
      setIsLoadingPreviews(false);
    }
  }

  function togglePreviewSelect(path: string) {
    setSelectedPreviews(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectAllPreviews() {
    const validPaths = previewFiles.filter(f => f.is_valid).map(f => f.path);
    setSelectedPreviews(new Set(validPaths));
  }

  function deselectAllPreviews() {
    setSelectedPreviews(new Set());
  }

  // Auto-select first category
  useEffect(() => {
    if (categoryList.length > 0 && !selectedCategory) {
      setSelectedCategory(categoryList[0]);
    }
  }, [categoryList, selectedCategory]);

  async function startScan() {
    if (isScanning) {
      await invoke("stop_watch");
      setIsScanning(false);
      setTotalFiles(0);
    } else {
      try {
        setProposals([]);
        setSelectedCategory(null);
        setSelectedFile(null);
        setSkippedFiles([]);
        setShowSkippedNotice(false);
        setHasScanned(true);
        setHasOptimized(false); // Reset optimization flag
        await invoke("start_watch", { path, apiKey });
        setIsScanning(true);
      } catch (e) {
        alert("Error: " + e);
      }
    }
  }

  // Reset to preview mode
  function resetToPreview() {
    setHasScanned(false);
    setHasOptimized(false);
    setProposals([]);
    setSelectedCategory(null);
    setSelectedFile(null);
    loadPreviewFiles();
  }

  function toggleFileSelection(id: string) {
    setProposals(prev =>
      prev.map(p => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  }

  function handleEditSave(id: string, name: string, category: string) {
    setProposals(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, proposed_name: name, proposed_category: category }
          : p
      )
    );
    // Update selected category if changed
    if (category !== editingFile?.proposed_category) {
      setSelectedCategory(category);
    }
    setEditingFile(null);
  }

  function handleSettingsSave(newApiKey: string, newPath: string) {
    setApiKey(newApiKey);
    setPath(newPath);
  }

  // Track if we've already optimized/subdivided to prevent re-runs
  const [hasOptimized, setHasOptimized] = useState(false);

  // When all files are processed, stop scanning and optimize
  useEffect(() => {
    // Reset optimization flag when new scan starts
    if (proposals.length === 0) {
      setHasOptimized(false);
      return;
    }

    // Wait until all files are processed
    if (totalFiles === 0 || processedFiles < totalFiles) return;

    // Auto-stop scanning when done
    if (isScanning) {
      console.log("[APP] All files processed, stopping scan");
      invoke("stop_watch").catch(console.error);
      setIsScanning(false);
    }

    // Don't run optimization if already done or currently subdividing
    if (isSubcategorizing || hasOptimized) return;

    // Small delay to let UI settle, then optimize
    const timer = setTimeout(() => {
      runOptimization();
    }, 500);

    return () => clearTimeout(timer);
  }, [proposals.length, processedFiles, totalFiles, isSubcategorizing, hasOptimized, isScanning]);

  async function runOptimization() {
    console.log("[APP] Running folder optimization...");

    // Step 1: Optimize folder structure (merge small categories into "Other")
    const optimized = optimizeFolderStructure(proposals);
    const hasChanges = optimized.some((o, i) => o.proposed_category !== proposals[i].proposed_category);

    if (hasChanges) {
      console.log("[APP] Merging small categories into Other");
      setProposals(optimized);
    }

    // Step 2: Check for categories that need subdivision (20+ files)
    const currentProposals = hasChanges ? optimized : proposals;
    const categories = [...new Set(currentProposals.map(p => p.proposed_category))];

    for (const category of categories) {
      // Skip if already has subfolders
      if (category.includes("/")) continue;

      const filesInCategory = currentProposals.filter(p => p.proposed_category === category);

      if (shouldSubdivide(filesInCategory.length)) {
        console.log(`[APP] Category "${category}" has ${filesInCategory.length} files - subdividing`);
        await subdivideCategory(category, filesInCategory);
        // After subdividing one, mark as done (can be extended to handle multiple)
        break;
      }
    }

    setHasOptimized(true);
  }

  // Subdivide a large category into subfolders
  async function subdivideCategory(category: string, files: FileProposal[]) {
    setIsSubcategorizing(true);
    setSubcatCategory(category);
    setSubcatTotal(files.length);
    setSubcatCurrent(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setSubcatRecentFile(file.original_name);
      setSubcatCurrent(i + 1);

      try {
        const result = await invoke<{ id: string; subcategory: string }>(
          "get_subcategory",
          {
            filePath: file.original_path,
            parentCategory: category,
            apiKey,
          }
        );

        // Update with subfolder
        setProposals((prev) =>
          prev.map((p) =>
            p.id === file.id
              ? { ...p, proposed_category: `${category}/${formatCategory(result.subcategory)}` }
              : p
          )
        );
      } catch (e) {
        console.error("Subcategorization failed for", file.original_name, e);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSubcategorizing(false);
  }

  async function acceptAll() {
    const selectedFiles = proposals.filter(p => p.selected);
    if (selectedFiles.length === 0) return;

    setIsAccepting(true);

    // Create moving files data and show visualization
    const moving = createMovingFiles(selectedFiles);
    setMovingFiles(moving);
    setShowScanViz(true);
  }

  async function handleScanVizComplete() {
    const selectedFiles = proposals.filter(p => p.selected);

    // Move files
    for (const p of selectedFiles) {
      const parentDir = p.original_path.substring(0, p.original_path.lastIndexOf('/'));
      const newPath = `${parentDir}/${p.proposed_category}/${p.proposed_name}`;
      try {
        await invoke("execute_action", { originalPath: p.original_path, newPath });
      } catch (e) {
        console.error("Move failed:", e);
      }
    }

    // Remove from state
    setProposals(prev => prev.filter(p => !p.selected));
    setExitingFileIds(new Set());
    setSelectedFile(null);
    setIsAccepting(false);
    setShowScanViz(false);
    setMovingFiles([]);
  }

  const isLoading = isScanning && processedFiles < totalFiles;
  const hasResults = proposals.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-white/5 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold">Smart Dump</h1>
            <p className="text-[11px] text-white/40 font-mono">{path}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => setShowFolderPicker(true)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white/70"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title="Select Folder"
          >
            <FolderOpen className="w-4 h-4" />
          </motion.button>

          <motion.button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white/70"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </motion.button>

          <Button
            onClick={startScan}
            disabled={!apiKey || (!hasScanned && selectedPreviews.size === 0)}
            variant={isScanning ? "destructive" : "default"}
            className={
              isScanning
                ? "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                : "bg-white hover:bg-white/90 text-black font-medium"
            }
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Stop
              </>
            ) : !hasScanned ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Scan {selectedPreviews.size} Files
              </>
            ) : (
              "Scan"
            )}
          </Button>
        </div>
      </header>

      {/* Progress bar */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 2 }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 bg-white/5 overflow-hidden"
          >
            <motion.div
              className="h-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${(processedFiles / totalFiles) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skipped files notification */}
      <AnimatePresence>
        {showSkippedNotice && skippedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 right-4 z-50"
          >
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-[13px] text-amber-200 font-medium">
                  {skippedFiles.length} file{skippedFiles.length > 1 ? 's' : ''} skipped
                </p>
                <p className="text-[11px] text-amber-200/60">
                  Files over 5MB are not processed
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Show PreviewGrid before scanning, Folder view after */}
        {!hasScanned ? (
          // Pre-scan view - show thumbnail grid
          <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
            <PreviewGrid
              files={previewFiles}
              isLoading={isLoadingPreviews}
              selectedFiles={selectedPreviews}
              onToggleSelect={togglePreviewSelect}
              onSelectAll={selectAllPreviews}
              onDeselectAll={deselectAllPreviews}
            />
          </main>
        ) : (
          <>
            {/* Left sidebar - Folder tree */}
            <aside className="w-64 shrink-0 border-r border-white/5 bg-[var(--bg-secondary)] flex flex-col">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-[11px] font-medium text-white/40 uppercase tracking-wider flex items-center gap-2">
                  <FolderOpen className="w-3 h-3" />
                  Folders
                </h2>
                <button
                  onClick={resetToPreview}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Reset
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                {!hasResults && !isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                      <FolderOpen className="w-5 h-5 text-white/20" />
                    </div>
                    <p className="text-[13px] text-white/40">No folders yet</p>
                    <p className="text-[11px] text-white/25 mt-1">Analyzing files...</p>
                  </div>
                ) : isLoading && !hasResults ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <Loader2 className="w-6 h-6 text-white/40 animate-spin mb-3" />
                    <p className="text-[13px] text-white/40">Analyzing...</p>
                    <p className="text-[11px] text-white/25 mt-1">
                      {processedFiles}/{totalFiles}
                    </p>
                  </div>
                ) : (
                  <FolderTree
                    folders={folderTree}
                    selectedPath={selectedCategory}
                    onSelectFolder={setSelectedCategory}
                  />
                )}
              </div>

              {/* Accept All button */}
              {hasResults && (
                <div className="p-3 border-t border-white/5">
                  <Button
                    onClick={acceptAll}
                    disabled={selectedCount === 0 || isAccepting}
                    className="w-full bg-white hover:bg-white/90 text-black font-medium disabled:opacity-50"
                  >
                    {isAccepting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Accept All ({selectedCount})
                  </Button>
                  <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-white/30">
                    <span>{categoryList.length} folders</span>
                    <span>•</span>
                    <span>{totalCount} files</span>
                    {skippedFiles.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400/60">{skippedFiles.length} skipped</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </aside>

            {/* Middle - File list */}
            <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
              {selectedCategory && (
                <div className="shrink-0 px-5 py-3 border-b border-white/5 bg-[var(--bg-tertiary)]">
                  <div className="flex items-center gap-2">
                    {selectedCategory.split('/').map((part, index, arr) => (
                      <span key={index} className="flex items-center">
                        <span className={`text-[13px] ${index === arr.length - 1 ? 'font-medium text-white' : 'text-white/50'}`}>
                          {part}
                        </span>
                        {index < arr.length - 1 && (
                          <span className="text-white/20 mx-2">/</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {filesInSelectedCategory.length} files
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <FileList
                  files={filesInSelectedCategory}
                  selectedFileId={selectedFile?.id || null}
                  exitingFileIds={exitingFileIds}
                  onSelectFile={setSelectedFile}
                  onToggleSelection={toggleFileSelection}
                  onEditFile={setEditingFile}
                />
              </div>
            </main>

            {/* Right - Preview panel */}
            <AnimatePresence>
              {selectedFile && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 border-l border-white/5 overflow-hidden"
                >
                  <PreviewPanel
                    file={selectedFile}
                    onClose={() => setSelectedFile(null)}
                    onEdit={() => setEditingFile(selectedFile)}
                  />
                </motion.aside>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Settings Sheet */}
      <SettingsSheet
        open={showSettings}
        onOpenChange={setShowSettings}
        apiKey={apiKey}
        path={path}
        onSave={handleSettingsSave}
      />

      {/* Edit Modal */}
      <EditModal
        file={editingFile}
        categories={categoryList}
        onSave={handleEditSave}
        onClose={() => setEditingFile(null)}
      />

      {/* Folder Picker */}
      <FolderPicker
        open={showFolderPicker}
        onOpenChange={setShowFolderPicker}
        currentPath={path}
        onSelectFolder={setPath}
        onStartScan={startScan}
      />

      {/* Subcategorization Dialog */}
      <SubcategoryDialog
        open={isSubcategorizing}
        category={subcatCategory}
        current={subcatCurrent}
        total={subcatTotal}
        recentFile={subcatRecentFile}
      />

      {/* Scan Visualization */}
      <AnimatePresence>
        {showScanViz && (
          <ScanVisualization
            files={movingFiles}
            isActive={showScanViz}
            onComplete={handleScanVizComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
