import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Loader2, Check, Sparkles, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FolderTree, buildFolderTree, type FolderNode } from "@/components/FolderTree";
import { FileList } from "@/components/FileCard";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsSheet } from "@/components/SettingsSheet";
import { EditModal } from "@/components/EditModal";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

function App() {
  // Settings
  const [apiKey, setApiKey] = useState("1234455678");
  const [path, setPath] = useState("/Users/pawan/Desktop");
  const [showSettings, setShowSettings] = useState(false);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  // Data
  const [proposals, setProposals] = useState<FileProposal[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileProposal | null>(null);
  const [editingFile, setEditingFile] = useState<FileProposal | null>(null);

  // Animation state for file movement
  const [exitingFileIds, setExitingFileIds] = useState<Set<string>>(new Set());
  const [isAccepting, setIsAccepting] = useState(false);

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
      const proposal = { ...e.payload, selected: true };
      setProposals(prev => [...prev, proposal]);
      setProcessedFiles(prev => prev + 1);
    });

    return () => {
      u1.then(f => f());
      u2.then(f => f());
    };
  }, []);

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
        await invoke("start_watch", { path, apiKey });
        setIsScanning(true);
      } catch (e) {
        alert("Error: " + e);
      }
    }
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

  async function acceptAll() {
    const selectedFiles = proposals.filter(p => p.selected);
    if (selectedFiles.length === 0) return;

    setIsAccepting(true);
    
    // Animate files exiting
    const idsToExit = new Set(selectedFiles.map(f => f.id));
    setExitingFileIds(idsToExit);

    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 300));

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
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white/70"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Settings className="w-4 h-4" />
          </motion.button>

          <Button
            onClick={startScan}
            disabled={!apiKey}
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Folder tree */}
        <aside className="w-64 shrink-0 border-r border-white/5 bg-[var(--bg-secondary)] flex flex-col">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-[11px] font-medium text-white/40 uppercase tracking-wider flex items-center gap-2">
              <FolderOpen className="w-3 h-3" />
              Folders
            </h2>
          </div>

          <div className="flex-1 overflow-hidden">
            {!hasResults && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                  <FolderOpen className="w-5 h-5 text-white/20" />
                </div>
                <p className="text-[13px] text-white/40">No folders yet</p>
                <p className="text-[11px] text-white/25 mt-1">Click Scan to start</p>
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
    </div>
  );
}

export default App;
