import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Loader2, Check, Layers, FolderOpen, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FolderTree, buildFolderTree, type FolderNode } from "@/components/FolderTree";
import { FileList } from "@/components/FileCard";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsSheet } from "@/components/SettingsSheet";
import { EditModal } from "@/components/EditModal";
import { ConflictDialog, type ConflictItem } from "@/components/ConflictDialog";
import { FolderPicker } from "@/components/FolderPicker";
import { PreviewGrid } from "@/components/PreviewGrid";
import { optimizeFolderStructure, formatCategory, cleanupSubfolders } from "@/lib/categoryMerge";

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

interface ActivityEvent {
  id: string;
  type: "proposed" | "skipped" | "failed" | "info";
  title: string;
  detail?: string;
  time: number;
}

interface MoveResult {
  original_path: string;
  final_path: string;
  renamed: boolean;
}

interface MoveRecord {
  proposal: FileProposal;
  moved_path: string;
  renamed: boolean;
}

interface ScanSummary {
  total: number;
  processed: number;
  skipped: number;
  conflicts: number;
  foldersCreated: number;
  durationMs: number;
}

function App() {
  // Settings
  const [apiKey, setApiKey] = useState("**REMOVED**");
  const [path, setPath] = useState("/Users/pawan/Desktop/Select");
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
  const [moveErrors, setMoveErrors] = useState<Record<string, string>>({});
  const [lastMoveBatch, setLastMoveBatch] = useState<MoveRecord[]>([]);
  const [lastMoveRoot, setLastMoveRoot] = useState<string | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [overwriteIds, setOverwriteIds] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [showSummaryMain, setShowSummaryMain] = useState(false);
  const [showHome, setShowHome] = useState(true);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Animation state for file movement
  const [exitingFileIds, setExitingFileIds] = useState<Set<string>>(new Set());
  const [isAccepting, setIsAccepting] = useState(false);
  const [processedPreviewPaths, setProcessedPreviewPaths] = useState<Set<string>>(new Set());

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
    return proposals.filter(p => p.proposed_category === selectedCategory);
  }, [proposals, selectedCategory]);

  const subfoldersInSelectedCategory = useMemo(() => {
    if (!selectedCategory) return [];
    const prefix = `${selectedCategory}/`;
    const set = new Set<string>();
    proposals.forEach((p) => {
      if (p.proposed_category.startsWith(prefix)) {
        const remainder = p.proposed_category.slice(prefix.length);
        const next = remainder.split("/")[0];
        if (next) {
          set.add(`${selectedCategory}/${next}`);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [proposals, selectedCategory]);

  const selectedCount = proposals.filter(p => p.selected).length;
  const totalCount = proposals.length;
  const conflictIds = useMemo(() => new Set(conflicts.map(c => c.id)), [conflicts]);
  const folderCount = useMemo(() => {
    const top = new Set(proposals.map(p => p.proposed_category.split("/")[0]));
    return top.size;
  }, [proposals]);
  const topCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    proposals.forEach((p) => {
      const top = p.proposed_category.split("/")[0];
      counts[top] = (counts[top] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [proposals]);

  // Event listeners
  useEffect(() => {
    if (!invoke || !listen) return;

    const pushActivity = (event: ActivityEvent) => {
      setActivityEvents(prev => {
        const next = [event, ...prev];
        return next.slice(0, 120);
      });
    };

    const u1 = listen("scan-summary", (e: any) => {
      setTotalFiles(e.payload as number);
      setProcessedFiles(0);
      pushActivity({
        id: `summary-${Date.now()}`,
        type: "info",
        title: `Scanning ${e.payload} files`,
        time: Date.now(),
      });
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
      setProcessedPreviewPaths(prev => {
        const next = new Set(prev);
        next.add(proposal.original_path);
        return next;
      });
      pushActivity({
        id: `proposed-${proposal.id}-${Date.now()}`,
        type: "proposed",
        title: proposal.proposed_name,
        detail: proposal.proposed_category,
        time: Date.now(),
      });
    });

    const u3 = listen("file-skipped", (e: any) => {
      const skipped = e.payload as SkippedFile;
      setSkippedFiles(prev => [...prev, skipped]);
      setShowSkippedNotice(true);
      pushActivity({
        id: `skipped-${skipped.name}-${Date.now()}`,
        type: "skipped",
        title: skipped.name,
        detail: skipped.reason,
        time: Date.now(),
      });
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
    if (!summary || !showSummaryMain || isSummaryLoading || summaryText || !apiKey) return;

    const fetchSummary = async () => {
      setIsSummaryLoading(true);
      try {
        const text = await invoke<string>("get_scan_summary", {
          request: {
            total: summary.total,
            processed: summary.processed,
            skipped: summary.skipped,
            conflicts: summary.conflicts,
            folders: summary.foldersCreated,
            durationSeconds: Math.round(summary.durationMs / 1000),
                            topCategories: topCategories.map(([name, count]) => [name, count]),
          },
          apiKey,
        });
        setSummaryText(text);
      } catch (e) {
        setSummaryText(null);
      } finally {
        setIsSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [summary, showSummaryMain, isSummaryLoading, summaryText, apiKey, topCategories]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMove = (event: MouseEvent) => {
      const minWidth = 200;
      const maxWidth = 420;
      const next = Math.min(Math.max(event.clientX, minWidth), maxWidth);
      setSidebarWidth(next);
    };

    const handleUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!invoke || !listen) return;
    const u4 = listen("file-failed", (e: any) => {
      console.log("File processing failed:", e.payload);
      setProcessedFiles(prev => prev + 1);
      setActivityEvents(prev => {
        const next = [
          {
            id: `failed-${Date.now()}`,
            type: "failed",
            title: String(e.payload),
            time: Date.now(),
          },
          ...prev,
        ];
        return next.slice(0, 120);
      });
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

  function sanitizeSegment(value: string) {
    return value.replace(/[\\\/]/g, "").replace(/[:*?"<>|]/g, "").trim();
  }

  function sanitizeCategoryPath(category: string) {
    const parts = category
      .split("/")
      .map((part) => sanitizeSegment(part))
      .filter((part) => part.length > 0 && part !== "." && part !== "..");
    return parts.join("/");
  }

  function sanitizeFileName(name: string) {
    const cleaned = sanitizeSegment(name);
    if (cleaned.length === 0 || cleaned === "." || cleaned === "..") {
      return "untitled.png";
    }
    return cleaned;
  }

  function ensurePng(name: string) {
    return name.toLowerCase().endsWith(".png") ? name : `${name}.png`;
  }

  function getDestinationPath(file: FileProposal, rootPath: string) {
    const parentDir = file.original_path.substring(0, file.original_path.lastIndexOf("/"));
    const safeCategory = sanitizeCategoryPath(file.proposed_category) || "Other";
    const safeName = ensurePng(sanitizeFileName(file.proposed_name));
    const newPath = `${parentDir}/${safeCategory}/${safeName}`;
    return { newPath, safeCategory, safeName, rootPath };
  }

  // Auto-select first category
  useEffect(() => {
    if (categoryList.length > 0 && !selectedCategory) {
      setSelectedCategory(categoryList[0]);
    }
  }, [categoryList, selectedCategory]);

  async function startScan(options?: { path?: string; selectedPaths?: string[] }) {
    if (isScanning) {
      await invoke("stop_watch");
      setIsScanning(false);
      setTotalFiles(0);
    } else {
      try {
        const scanPath = options?.path ?? path;
        const selectedPaths =
          options?.selectedPaths ??
          (!hasScanned ? Array.from(selectedPreviews) : undefined);

        setProposals([]);
        setSelectedCategory(null);
        setSelectedFile(null);
        setSkippedFiles([]);
        setShowSkippedNotice(false);
        setMoveErrors({});
        setLastMoveBatch([]);
        setLastMoveRoot(null);
        setShowUndo(false);
        setUndoStatus(null);
        setConflicts([]);
        setShowConflictDialog(false);
        setOverwriteIds(new Set());
        setProcessedPreviewPaths(new Set());
        setActivityEvents([]);
        setSummary(null);
        setShowSummaryMain(false);
        setShowHome(false);
        setSummaryText(null);
        setIsSummaryLoading(false);
        setHasScanned(true);
        setHasOptimized(false); // Reset optimization flag
        if (options?.path && options.path !== path) {
          setPath(options.path);
        }
        setScanStartedAt(Date.now());
        await invoke("start_watch", {
          path: scanPath,
          apiKey,
          selectedPaths: selectedPaths && selectedPaths.length > 0 ? selectedPaths : undefined,
        });
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
    setMoveErrors({});
    setLastMoveBatch([]);
    setLastMoveRoot(null);
    setShowUndo(false);
    setUndoStatus(null);
    setConflicts([]);
    setShowConflictDialog(false);
    setOverwriteIds(new Set());
    setProcessedPreviewPaths(new Set());
    setActivityEvents([]);
    setSummary(null);
    setShowSummaryMain(false);
    setScanStartedAt(null);
    setShowHome(true);
    setSummaryText(null);
    setIsSummaryLoading(false);
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
    setMoveErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
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

    if (scanStartedAt && !summary) {
      const elapsed = Date.now() - scanStartedAt;
      const total = totalFiles;
      const skipped = skippedFiles.length;
      const uniqueFolders = new Set(proposals.map(p => p.proposed_category.split("/")[0]));
      const conflictsCount = conflicts.length;
      setSummary({
        total,
        processed: processedFiles,
        skipped,
        conflicts: conflictsCount,
        foldersCreated: uniqueFolders.size,
        durationMs: elapsed,
      });
      setShowSummaryMain(true);
    }

    // Don't run optimization if already done
    if (hasOptimized) return;

    // Small delay to let UI settle, then optimize
    const timer = setTimeout(() => {
      runOptimization();
    }, 500);

    return () => clearTimeout(timer);
  }, [proposals.length, processedFiles, totalFiles, hasOptimized, isScanning]);

  async function runOptimization() {
    console.log("[APP] Running folder optimization...");

    // Step 1: Optimize folder structure (merge small categories into "Other")
    const optimized = optimizeFolderStructure(proposals);
    const cleaned = cleanupSubfolders(optimized);
    const hasChanges = cleaned.some((o, i) => o.proposed_category !== proposals[i].proposed_category);

    if (hasChanges) {
      console.log("[APP] Merging small categories into Other");
      setProposals(cleaned);
    }
    setHasOptimized(true);
  }

  async function detectConflicts() {
    const selectedFiles = proposals.filter(p => p.selected);
    if (selectedFiles.length === 0) return [] as ConflictItem[];

    const entries = selectedFiles.map((file) => {
      const { newPath, safeCategory, safeName } = getDestinationPath(file, path);
      return {
        id: file.id,
        original_name: file.original_name,
        proposed_name: safeName,
        proposed_category: safeCategory,
        destination: newPath,
        reasons: [] as string[],
      };
    });

    const destMap = new Map<string, ConflictItem[]>();
    entries.forEach((entry) => {
      const list = destMap.get(entry.destination) ?? [];
      list.push(entry);
      destMap.set(entry.destination, list);
    });

    const uniqueDestinations = Array.from(destMap.keys());
    let existing = new Set<string>();
    try {
      const existingPaths = await invoke<string[]>("check_existing_paths", {
        paths: uniqueDestinations,
      });
      existing = new Set(existingPaths);
    } catch (e) {
      console.warn("Conflict check failed:", e);
    }

    entries.forEach((entry) => {
      if ((destMap.get(entry.destination)?.length ?? 0) > 1) {
        entry.reasons.push("Duplicate destination");
      }
      if (existing.has(entry.destination) && !overwriteIds.has(entry.id)) {
        entry.reasons.push("File already exists");
      }
    });

    return entries.filter((entry) => entry.reasons.length > 0);
  }

  async function refreshConflicts() {
    const next = await detectConflicts();
    setConflicts(next);
    setShowConflictDialog(next.length > 0);
    return next;
  }

  async function acceptAll() {
    const selectedFiles = proposals.filter(p => p.selected);
    if (selectedFiles.length === 0) return;

    const detected = await refreshConflicts();
    if (detected.length > 0) return;

    setIsAccepting(true);
    await handleScanVizComplete();
  }

  async function handleScanVizComplete() {
    const selectedFiles = proposals.filter(p => p.selected);
    const movedRecords: MoveRecord[] = [];
    const failures: Record<string, string> = {};

    for (const p of selectedFiles) {
      const { newPath, safeCategory, safeName } = getDestinationPath(p, path);
      const overwrite = overwriteIds.has(p.id);

      try {
        const result = await invoke<MoveResult>("execute_action", {
          originalPath: p.original_path,
          newPath,
          rootPath: path,
          overwrite,
        });
        movedRecords.push({
          proposal: { ...p, proposed_category: safeCategory, proposed_name: safeName },
          moved_path: result.final_path,
          renamed: result.renamed,
        });
      } catch (e) {
        failures[p.id] = String(e);
      }
    }

    if (Object.keys(failures).length > 0) {
      setMoveErrors(prev => ({ ...prev, ...failures }));
    }

    if (movedRecords.length > 0) {
      const movedIds = new Set(movedRecords.map(m => m.proposal.id));
      setProposals(prev => prev.filter(p => !movedIds.has(p.id)));
      setLastMoveBatch(movedRecords);
      setLastMoveRoot(path);
      setShowUndo(true);
      setUndoStatus(null);
    }

    setExitingFileIds(new Set());
    setSelectedFile(null);
    setIsAccepting(false);
    setOverwriteIds(new Set());
  }

  async function undoLastMove() {
    if (isUndoing || lastMoveBatch.length === 0) return;

    setIsUndoing(true);
    const rootPath = lastMoveRoot ?? path;
    const restored: FileProposal[] = [];
    const remaining: MoveRecord[] = [];

    for (const record of lastMoveBatch) {
      try {
        await invoke<MoveResult>("execute_action", {
          originalPath: record.moved_path,
          newPath: record.proposal.original_path,
          rootPath,
        });
        restored.push(record.proposal);
      } catch (e) {
        remaining.push(record);
      }
    }

    if (restored.length > 0) {
      const restoredIds = new Set(restored.map(p => p.id));
      setProposals(prev => [...restored, ...prev.filter(p => !restoredIds.has(p.id))]);
    }

    if (remaining.length === 0) {
      setLastMoveBatch([]);
      setLastMoveRoot(null);
      setUndoStatus(`${restored.length} file${restored.length === 1 ? "" : "s"} restored`);
      setShowUndo(true);
    } else {
      setLastMoveBatch(remaining);
      setUndoStatus(`Undo failed for ${remaining.length} file${remaining.length === 1 ? "" : "s"}`);
    }

    setIsUndoing(false);
  }

  function handleConflictRename(id: string, nextName: string) {
    setProposals(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, proposed_name: nextName }
          : p
      )
    );
    setOverwriteIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTimeout(() => {
      refreshConflicts().catch(() => {});
    }, 0);
  }

  function handleConflictSkip(id: string) {
    setProposals(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, selected: false }
          : p
      )
    );
    setOverwriteIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTimeout(() => {
      refreshConflicts().catch(() => {});
    }, 0);
  }

  function handleConflictToggleOverwrite(id: string) {
    setOverwriteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setTimeout(() => {
      refreshConflicts().catch(() => {});
    }, 0);
  }

  async function handleConflictProceed() {
    const latest = await refreshConflicts();
    if (latest.length === 0) {
      setShowConflictDialog(false);
      setIsAccepting(true);
      await handleScanVizComplete();
    }
  }

  const isLoading = isScanning && processedFiles < totalFiles;
  const isScanInProgress = isScanning && processedFiles < totalFiles;
  const hasResults = proposals.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-white/5 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Layers className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold">SnapSort</h1>
            <p className="text-[11px] text-white/40 font-mono">{path}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isScanInProgress && (
            <div className="px-2.5 py-1 rounded-full text-[11px] text-white/70 bg-white/10 border border-white/10">
              Scanning {processedFiles}/{totalFiles}
            </div>
          )}
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
                <Layers className="w-4 h-4 mr-2" />
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

      {/* Undo banner */}
      <AnimatePresence>
        {showUndo && (lastMoveBatch.length > 0 || undoStatus) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 right-4 z-50"
          >
            <div className="bg-white/10 border border-white/10 rounded-lg px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
              <div className="text-[12px] text-white/70">
                {undoStatus ?? `${lastMoveBatch.length} file${lastMoveBatch.length === 1 ? "" : "s"} moved`}
              </div>
              <button
                onClick={undoLastMove}
                disabled={isUndoing || lastMoveBatch.length === 0}
                className="text-[12px] px-2 py-1 rounded-md bg-white text-black disabled:opacity-50"
              >
                {isUndoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Undo"}
              </button>
              <button
                onClick={() => {
                  setShowUndo(false);
                  setLastMoveBatch([]);
                  setLastMoveRoot(null);
                  setUndoStatus(null);
                }}
                className="text-[11px] text-white/50 hover:text-white/70"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Show PreviewGrid before scanning, Folder view after */}
        {!hasScanned ? (
          // Pre-scan view - home screen
          <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
            {showHome ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="max-w-5xl w-full px-8">
                  <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                        Precision file organization
                      </p>
                      <h2 className="text-[30px] leading-tight font-semibold text-white mt-3">
                        SnapSort turns screenshot chaos into a clean library.
                      </h2>
                      <p className="text-[14px] text-white/65 mt-4 leading-relaxed">
                        Drop a folder, review the preview, and accept a tidy structure you can search
                        later. No surprises, just confident moves.
                      </p>
                      <div className="mt-7 flex items-center gap-3">
                        <Button
                          onClick={() => setShowFolderPicker(true)}
                          className="bg-white text-black hover:bg-white/90"
                        >
                          Choose Folder
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowHome(false)}
                          className="border-white/10 bg-transparent text-white/70 hover:bg-white/5"
                        >
                          Preview screenshots
                        </Button>
                      </div>
                      <div className="mt-6 flex items-center gap-6 text-[11px] text-white/40">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
                          Auto rename
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
                          Smart categories
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/30" />
                          Safe moves
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-5">
                      <div className="flex items-center justify-between text-[11px] text-white/40">
                        <span>Preview</span>
                        <span className="font-mono">0 selected</span>
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between">
                            <div className="h-2 w-28 rounded-full bg-white/10" />
                            <div className="h-2 w-10 rounded-full bg-white/5" />
                          </div>
                          <div className="mt-3 h-16 rounded-lg bg-gradient-to-br from-white/10 to-transparent border border-white/5" />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between">
                            <div className="h-2 w-24 rounded-full bg-white/10" />
                            <div className="h-2 w-12 rounded-full bg-white/5" />
                          </div>
                          <div className="mt-3 h-16 rounded-lg bg-gradient-to-br from-white/10 to-transparent border border-white/5" />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between">
                            <div className="h-2 w-32 rounded-full bg-white/10" />
                            <div className="h-2 w-8 rounded-full bg-white/5" />
                          </div>
                          <div className="mt-3 h-16 rounded-lg bg-gradient-to-br from-white/10 to-transparent border border-white/5" />
                        </div>
                      </div>
                      <div className="mt-4 text-[11px] text-white/35">
                        Review before moving. One click to accept the new structure.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <PreviewGrid
                files={previewFiles}
                isLoading={isLoadingPreviews}
                selectedFiles={selectedPreviews}
                onToggleSelect={togglePreviewSelect}
                onSelectAll={selectAllPreviews}
                onDeselectAll={deselectAllPreviews}
                processedFiles={processedPreviewPaths}
                hideProcessed={false}
              />
            )}
          </main>
        ) : (
          <>
            {/* Left sidebar - Folder tree */}
            <aside
              className="shrink-0 border-r border-white/5 bg-[var(--bg-secondary)] flex flex-col relative"
              style={{ width: sidebarWidth }}
            >
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

              <div
                onMouseDown={() => setIsResizingSidebar(true)}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-white/10"
                title="Drag to resize"
              />
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
                {isScanInProgress ? (
                  <PreviewGrid
                    files={previewFiles}
                    isLoading={isLoadingPreviews}
                    selectedFiles={selectedPreviews}
                    onToggleSelect={togglePreviewSelect}
                    onSelectAll={selectAllPreviews}
                    onDeselectAll={deselectAllPreviews}
                    isReadOnly
                    processedFiles={processedPreviewPaths}
                    hideProcessed
                    showProcessedBadge={false}
                  />
                ) : showSummaryMain && summary ? (
                  <div className="h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto p-8">
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/[0.04] to-transparent p-6">
                        <p className="text-[11px] uppercase tracking-wider text-white/40">
                          AI Summary
                        </p>
                        <h2 className="text-[22px] text-white font-semibold mt-2">
                          Your screenshots are organized.
                        </h2>
                        <p className="text-[13px] text-white/60 mt-1">
                          {summary.processed} files sorted into {summary.foldersCreated} folders in {Math.round(summary.durationMs / 1000)}s.
                        </p>
                        <div className="mt-4">
                          {isSummaryLoading ? (
                            <div className="h-12 rounded-lg bg-white/5 animate-pulse" />
                          ) : summaryText ? (
                            <p className="text-[13px] text-white/70 leading-relaxed">
                              {summaryText}
                            </p>
                          ) : (
                            <p className="text-[13px] text-white/40">
                              Summary unavailable.
                            </p>
                          )}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3 text-[11px] text-white/70">
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            Scanned · {summary.total}
                          </div>
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            Folders · {summary.foldersCreated}
                          </div>
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            Skipped · {summary.skipped}
                          </div>
                          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                            Conflicts · {summary.conflicts}
                          </div>
                        </div>
                        {topCategories.length > 0 && (
                          <div className="mt-6">
                            <p className="text-[11px] uppercase tracking-wider text-white/40">
                              Top Categories
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {topCategories.map(([cat, count]) => (
                                <div
                                  key={cat}
                                  className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70"
                                >
                                  {cat} · {count}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-6 flex flex-col gap-2">
                          <Button
                            onClick={() => {
                              setShowSummaryMain(false);
                              if (conflicts.length > 0) {
                                setShowConflictDialog(true);
                              }
                            }}
                            className="w-full bg-white text-black hover:bg-white/90"
                          >
                            Review conflicts
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowSummaryMain(false);
                              setSelectedCategory(categoryList[0] ?? null);
                            }}
                            className="w-full border-white/10 bg-transparent text-white/70 hover:bg-white/5"
                          >
                            Review folders
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : hasResults ? (
                  <FileList
                    files={filesInSelectedCategory}
                    folders={subfoldersInSelectedCategory}
                    selectedPath={selectedCategory}
                    selectedFileId={selectedFile?.id || null}
                    exitingFileIds={exitingFileIds}
                    moveErrors={moveErrors}
                    conflictIds={conflictIds}
                    onSelectFile={setSelectedFile}
                    onToggleSelection={toggleFileSelection}
                    onEditFile={setEditingFile}
                    onSelectFolder={setSelectedCategory}
                  />
                ) : (
                  <div className="h-full relative">
                    <PreviewGrid
                      files={previewFiles}
                      isLoading={isLoadingPreviews}
                      selectedFiles={selectedPreviews}
                      onToggleSelect={togglePreviewSelect}
                      onSelectAll={selectAllPreviews}
                      onDeselectAll={deselectAllPreviews}
                      isReadOnly={hasScanned}
                      processedFiles={processedPreviewPaths}
                      hideProcessed={false}
                    />
                  </div>
                )}
              </div>
            </main>

            {/* Right - Preview panel */}
            <AnimatePresence>
              {isScanInProgress ? (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 280, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 border-l border-white/5 overflow-hidden bg-[var(--bg-secondary)]"
                >
                  <div className="h-full flex flex-col">
                    <div className="px-4 py-3 border-b border-white/5">
                      <div className="text-[11px] uppercase tracking-wider text-white/40">
                        Activity
                      </div>
                      <div className="text-[12px] text-white/70 mt-1">
                        {processedFiles}/{totalFiles}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="p-3 space-y-2">
                        {activityEvents.length === 0 ? (
                          <div className="text-[12px] text-white/40">Waiting for results...</div>
                        ) : (
                          activityEvents.map((event) => (
                            <div
                              key={event.id}
                              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5"
                            >
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  event.type === "proposed"
                                    ? "bg-green-400"
                                    : event.type === "skipped"
                                      ? "bg-amber-400"
                                      : event.type === "failed"
                                        ? "bg-red-400"
                                        : "bg-white/40"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] text-white/80 truncate">
                                  {event.title}
                                </p>
                                {event.detail && (
                                  <p className="text-[11px] text-white/30 truncate">
                                    {event.detail}
                                  </p>
                                )}
                              </div>
                              <div className="text-[10px] text-white/30">
                                {new Date(event.time).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </motion.aside>
              ) : selectedFile && (
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
        onStartScan={(scanPath, selectedPaths) =>
          startScan({ path: scanPath, selectedPaths })
        }
      />

      {/* Conflict Dialog */}
      <ConflictDialog
        open={showConflictDialog}
        conflicts={conflicts}
        overwriteIds={overwriteIds}
        onRename={handleConflictRename}
        onSkip={handleConflictSkip}
        onToggleOverwrite={handleConflictToggleOverwrite}
        onProceed={handleConflictProceed}
        onClose={() => setShowConflictDialog(false)}
      />

    </div>
  );
}

export default App;
