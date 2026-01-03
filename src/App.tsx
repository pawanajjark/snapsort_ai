import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  FolderOpen, Settings, Sparkles, Loader2, Check, X, Pencil,
  CheckCircle2, Circle, FolderPlus, ArrowRight, ChevronLeft,
  Save, Image, Layers
} from "lucide-react";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
  selected: boolean;
}

// Folder icons and colors
const folderStyles: Record<string, { icon: string; color: string; bg: string }> = {
  Finance: { icon: "💰", color: "text-emerald-400", bg: "bg-emerald-500/20" },
  Dev: { icon: "💻", color: "text-blue-400", bg: "bg-blue-500/20" },
  Development: { icon: "💻", color: "text-blue-400", bg: "bg-blue-500/20" },
  Code: { icon: "🧑‍💻", color: "text-cyan-400", bg: "bg-cyan-500/20" },
  Social: { icon: "💬", color: "text-pink-400", bg: "bg-pink-500/20" },
  Design: { icon: "🎨", color: "text-purple-400", bg: "bg-purple-500/20" },
  Documents: { icon: "📄", color: "text-amber-400", bg: "bg-amber-500/20" },
  Photos: { icon: "📷", color: "text-rose-400", bg: "bg-rose-500/20" },
  Work: { icon: "💼", color: "text-indigo-400", bg: "bg-indigo-500/20" },
  Personal: { icon: "🏠", color: "text-teal-400", bg: "bg-teal-500/20" },
  Shopping: { icon: "🛒", color: "text-orange-400", bg: "bg-orange-500/20" },
  Travel: { icon: "✈️", color: "text-sky-400", bg: "bg-sky-500/20" },
  Health: { icon: "🏥", color: "text-red-400", bg: "bg-red-500/20" },
  Entertainment: { icon: "🎮", color: "text-violet-400", bg: "bg-violet-500/20" },
  Education: { icon: "📚", color: "text-yellow-400", bg: "bg-yellow-500/20" },
  Music: { icon: "🎵", color: "text-fuchsia-400", bg: "bg-fuchsia-500/20" },
  default: { icon: "📁", color: "text-gray-400", bg: "bg-gray-500/20" },
};

function getFolderStyle(category: string) {
  return folderStyles[category] || folderStyles.default;
}

function App() {
  const [apiKey, setApiKey] = useState("1234455678");
  const [path, setPath] = useState("/Users/pawan/Desktop");
  const [isScanning, setIsScanning] = useState(false);
  const [proposals, setProposals] = useState<FileProposal[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileProposal | null>(null);
  const [editingFile, setEditingFile] = useState<FileProposal | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [tempPath, setTempPath] = useState(path);
  const [organizingCategory, setOrganizingCategory] = useState<string | null>(null);

  const LARGE_FOLDER_THRESHOLD = 10;

  // Group proposals by category
  const categories = proposals.reduce((acc, p) => {
    if (!acc[p.proposed_category]) {
      acc[p.proposed_category] = [];
    }
    acc[p.proposed_category].push(p);
    return acc;
  }, {} as Record<string, FileProposal[]>);

  const categoryList = Object.keys(categories).sort();
  const filesInSelectedCategory = selectedCategory ? categories[selectedCategory] || [] : [];
  const selectedCount = proposals.filter(p => p.selected).length;
  const totalCount = proposals.length;

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
      if (!selectedCategory) {
        setSelectedCategory(e.payload.proposed_category);
      }
    });

    return () => { u1.then(f => f()); u2.then(f => f()); };
  }, [selectedCategory]);

  async function startScan() {
    if (isScanning) {
      await invoke("stop_watch");
      setIsScanning(false);
      setTotalFiles(0);
    } else {
      try {
        setProposals([]);
        setSelectedCategory(null);
        setPreviewFile(null);
        await invoke("start_watch", { path, apiKey });
        setIsScanning(true);
      } catch (e) {
        alert("Error: " + e);
      }
    }
  }

  function toggleFileSelection(id: string) {
    setProposals(prev => prev.map(p => 
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  }

  function toggleCategorySelection(category: string) {
    const allSelected = categories[category].every(p => p.selected);
    setProposals(prev => prev.map(p => 
      p.proposed_category === category ? { ...p, selected: !allSelected } : p
    ));
  }

  function startEdit(file: FileProposal) {
    setEditingFile(file);
    setEditName(file.proposed_name);
    setEditCategory(file.proposed_category);
  }

  function saveEdit() {
    if (!editingFile) return;
    setProposals(prev => prev.map(p => 
      p.id === editingFile.id 
        ? { ...p, proposed_name: editName, proposed_category: editCategory }
        : p
    ));
    if (editCategory !== editingFile.proposed_category) {
      setSelectedCategory(editCategory);
    }
    setEditingFile(null);
  }

  function saveSettings() {
    setApiKey(tempApiKey);
    setPath(tempPath);
    setShowSettings(false);
  }

  // Organize folder into subfolders using AI analysis
  const [organizeProgress, setOrganizeProgress] = useState({ current: 0, total: 0 });
  
  async function organizeFolder(category: string) {
    setOrganizingCategory(category);
    const filesToOrganize = proposals.filter(p => p.proposed_category === category);
    setOrganizeProgress({ current: 0, total: filesToOrganize.length });

    // Analyze each file with AI to get more specific subcategory
    for (let i = 0; i < filesToOrganize.length; i++) {
      const file = filesToOrganize[i];
      setOrganizeProgress({ current: i + 1, total: filesToOrganize.length });

      try {
        const result = await invoke<{ id: string; subcategory: string }>("get_subcategory", {
          filePath: file.original_path,
          parentCategory: category,
          apiKey: apiKey
        });

        // Update with AI-suggested subcategory
        setProposals(prev => prev.map(p =>
          p.id === file.id
            ? { ...p, proposed_category: `${category}/${result.subcategory}` }
            : p
        ));
      } catch (e) {
        console.error("Failed to get subcategory:", e);
        // Keep original category if failed
      }
    }

    setOrganizingCategory(null);
    setOrganizeProgress({ current: 0, total: 0 });
    setSelectedCategory(null);
  }

  async function acceptAll() {
    const selectedFiles = proposals.filter(p => p.selected);
    for (const p of selectedFiles) {
      const parentDir = p.original_path.substring(0, p.original_path.lastIndexOf('/'));
      const newPath = `${parentDir}/${p.proposed_category}/${p.proposed_name}`;
      try {
        await invoke("execute_action", { originalPath: p.original_path, newPath });
      } catch (e) {
        console.error("Move failed:", e);
      }
    }
    setProposals(prev => prev.filter(p => !p.selected));
    setSelectedCategory(null);
    setPreviewFile(null);
  }

  const isLoading = isScanning && processedFiles < totalFiles;
  const hasResults = proposals.length > 0;

  // Settings Page
  if (showSettings) {
    return (
      <div className="h-screen bg-[#0c0c0d] text-white font-['Inter',system-ui,sans-serif] flex items-center justify-center">
        <div className="w-full max-w-lg animate-fade-in">
          <button
            onClick={() => setShowSettings(false)}
            className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          
          <div className="bg-[#111113] rounded-2xl border border-white/10 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Settings</h1>
                <p className="text-sm text-white/40">Configure your preferences</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Watch Folder</label>
                <div className="relative">
                  <FolderOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    value={tempPath}
                    onChange={e => setTempPath(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-transparent transition-all"
                    placeholder="/Users/you/Desktop"
                  />
                </div>
                <p className="text-xs text-white/30">The folder where your screenshots are saved</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Claude API Key</label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={e => setTempApiKey(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-transparent transition-all"
                  placeholder="sk-ant-..."
                />
                <p className="text-xs text-white/30">Your Anthropic API key for Claude</p>
              </div>
              
              <button
                onClick={saveSettings}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20"
              >
                <Save className="w-4 h-4" />
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0c0c0d] text-white font-['Inter',system-ui,sans-serif] flex flex-col overflow-hidden">

        {/* Header */}
      <header className="shrink-0 border-b border-white/5 bg-[#111113]">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 animate-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Smart Dump</h1>
              <p className="text-xs text-white/40">{path}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTempApiKey(apiKey); setTempPath(path); setShowSettings(true); }}
              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105"
            >
              <Settings className="w-4 h-4 text-white/60" />
            </button>
            
            <button
              onClick={startScan}
              disabled={!apiKey}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
                isScanning 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
                  : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/20 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
              }`}
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Stop
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Scan
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {isLoading && (
          <div className="h-1 bg-white/5 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 transition-all duration-500 animate-shimmer"
              style={{ width: `${(processedFiles / totalFiles) * 100}%` }}
              />
            </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Categories/Folders */}
        <aside className="w-72 border-r border-white/5 bg-[#0a0a0b] flex flex-col">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
              <FolderPlus className="w-3.5 h-3.5" />
              Folders to Create
            </h2>
          </div>
          
          <div className="flex-1 overflow-auto p-3">
            {!hasResults && !isLoading && (
              <div className="p-6 text-center animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                  <FolderOpen className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/40 text-sm font-medium">No folders yet</p>
                <p className="text-white/25 text-xs mt-1">Click Scan to analyze screenshots</p>
              </div>
            )}
            
            {isLoading && !hasResults && (
              <div className="p-6 text-center animate-pulse">
                <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-violet-400" />
                <p className="text-white/50 text-sm">Analyzing screenshots...</p>
                <p className="text-white/30 text-xs mt-1">{processedFiles} of {totalFiles}</p>
              </div>
            )}
            
            <div className="space-y-1">
              {categoryList.map((category, index) => {
                const files = categories[category];
                const selectedInCategory = files.filter(f => f.selected).length;
                const isSelected = selectedCategory === category;
                const style = getFolderStyle(category);
                const isLargeFolder = files.length > LARGE_FOLDER_THRESHOLD;

                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all group animate-slide-in ${
                      isSelected
                        ? `${style.bg} ring-1 ring-white/10`
                        : 'hover:bg-white/5'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <span className="text-xl">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold truncate ${isSelected ? style.color : 'text-white/80'}`}>
                          {category}
                        </span>
                        {isLargeFolder && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {files.length}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-white/40">
                        {selectedInCategory} of {files.length} selected
                      </span>
                    </div>
                    <ChevronLeft className={`w-4 h-4 rotate-180 transition-transform ${isSelected ? 'text-white/50' : 'text-white/20 group-hover:text-white/40'}`} />
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Accept All Button */}
          {hasResults && (
            <div className="p-4 border-t border-white/5 bg-[#0f0f11]">
          <button
                onClick={acceptAll}
                disabled={selectedCount === 0}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
              >
                <Check className="w-5 h-5" />
                Accept All ({selectedCount})
          </button>
              <div className="flex items-center justify-center gap-4 mt-3 text-xs text-white/30">
                <span>{categoryList.length} folders</span>
                <span>•</span>
                <span>{totalCount} files</span>
              </div>
        </div>
          )}
        </aside>

        {/* Middle Panel - Files in Category */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0d]">
          {selectedCategory ? (
            <>
              {/* Category Header */}
              <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0f0f11]">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{getFolderStyle(selectedCategory).icon}</span>
                  <div>
                    <h2 className="text-lg font-bold">{selectedCategory}</h2>
                    <p className="text-xs text-white/40">{filesInSelectedCategory.length} files</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCategorySelection(selectedCategory)}
                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-all flex items-center gap-2"
                  >
                    {filesInSelectedCategory.every(f => f.selected) ? (
                      <>
                        <Circle className="w-4 h-4" />
                        Deselect all
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Select all
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Files Grid */}
              <div className="flex-1 overflow-auto p-6">
                {/* Organize Folder Banner - shown when folder has many files */}
                {filesInSelectedCategory.length > LARGE_FOLDER_THRESHOLD && (
                  <button
                    onClick={() => organizeFolder(selectedCategory)}
                    disabled={organizingCategory !== null}
                    className="w-full mb-4 p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 hover:border-violet-500/40 transition-all group hover:scale-[1.005] disabled:cursor-wait"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center ${organizingCategory ? 'animate-pulse' : 'group-hover:scale-110'} transition-transform`}>
                        {organizingCategory ? (
                          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                        ) : (
                          <Sparkles className="w-6 h-6 text-violet-400" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-violet-300">
                          {organizingCategory ? `Analyzing with AI... (${organizeProgress.current}/${organizeProgress.total})` : 'Smart Organize with AI'}
                        </p>
                        <p className="text-xs text-white/40">
                          {organizingCategory
                            ? 'Claude is analyzing each screenshot for more specific categories'
                            : `${filesInSelectedCategory.length} files → AI will create specific subfolders like Receipts, Invoices, etc.`}
                        </p>
                        {organizingCategory && organizeProgress.total > 0 && (
                          <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                              style={{ width: `${(organizeProgress.current / organizeProgress.total) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {!organizingCategory && (
                        <div className="px-4 py-2 rounded-lg bg-violet-500/20 text-violet-400 text-sm font-semibold group-hover:bg-violet-500/30 transition-colors flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Organize
                        </div>
                      )}
                    </div>
                  </button>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filesInSelectedCategory.map((file, index) => (
                    <div
                      key={file.id}
                      className={`group flex gap-4 p-4 rounded-2xl border transition-all cursor-pointer animate-slide-in hover:scale-[1.01] ${
                        file.selected 
                          ? 'bg-white/5 border-white/10 hover:border-white/20' 
                          : 'bg-white/[0.02] border-transparent opacity-50 hover:opacity-70'
                      } ${previewFile?.id === file.id ? 'ring-2 ring-violet-500/50 border-violet-500/30' : ''}`}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => setPreviewFile(file)}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.id); }}
                        className="shrink-0 mt-1 transition-transform hover:scale-110"
                      >
                        {file.selected ? (
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <Circle className="w-6 h-6 text-white/30" />
                        )}
                      </button>
                      
                      {/* Thumbnail */}
                      <div className="w-24 h-16 rounded-xl bg-black/50 overflow-hidden shrink-0 ring-1 ring-white/10">
                        <img 
                          src={convertFileSrc(file.original_path)}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                          }}
                        />
                      </div>
                      
                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate group-hover:text-violet-300 transition-colors">
                          {file.proposed_name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40 mt-1">
                          <span className="truncate max-w-[150px]">{file.original_name}</span>
                        </div>
                        <p className="text-xs text-white/30 mt-2 italic line-clamp-1">"{file.reasoning}"</p>
                      </div>
                      
                      {/* Edit button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(file); }}
                        className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/40 hover:text-white transition-all shrink-0 self-start"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center animate-fade-in">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                  <FolderOpen className="w-10 h-10 text-white/20" />
                </div>
                <p className="text-white/40 font-medium">Select a folder to view files</p>
                <p className="text-white/25 text-sm mt-1">Choose from the left sidebar</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel - Preview */}
        {previewFile && (
          <aside className="w-80 border-l border-white/5 bg-[#0a0a0b] flex flex-col animate-slide-in-right">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white/60 flex items-center gap-2">
                <Image className="w-4 h-4" />
                Preview
              </h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {/* Large preview */}
              <div className="rounded-2xl overflow-hidden bg-black/50 mb-6 ring-1 ring-white/10">
                <img 
                  src={convertFileSrc(previewFile.original_path)}
                  alt=""
                  className="w-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = '<div class="w-full aspect-video flex items-center justify-center bg-white/5"><svg class="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                  }}
                />
              </div>
              
              {/* File details */}
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-white/5">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Original</label>
                  <p className="text-sm font-mono text-white/60 mt-1 break-all">{previewFile.original_name}</p>
                </div>
                
                <div className="flex items-center gap-3 px-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <ArrowRight className="w-4 h-4 text-violet-400" />
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
                
                <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <label className="text-[10px] text-violet-300 uppercase tracking-wider font-bold">New Name</label>
                  <p className="text-sm font-semibold mt-1">{previewFile.proposed_name}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg">{getFolderStyle(previewFile.proposed_category).icon}</span>
                    <span className="text-sm text-violet-300">{previewFile.proposed_category}/</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold">AI Reasoning</label>
                  <p className="text-sm text-white/60 mt-1 italic leading-relaxed">"{previewFile.reasoning}"</p>
                </div>

                <button
                  onClick={() => startEdit(previewFile)}
                  className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold transition-all flex items-center justify-center gap-2 hover:scale-[1.02]"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Details
                  </button>
              </div>
          </div>
          </aside>
        )}
      </div>

      {/* Edit Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#18181b] rounded-3xl border border-white/10 w-full max-w-md p-8 shadow-2xl animate-scale-in">
            <h3 className="text-xl font-bold mb-6">Edit File</h3>
            
            <div className="space-y-5">
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider font-bold">File Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider font-bold">Category / Folder</label>
                <input
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-transparent transition-all"
                />
              </div>
              
              {categoryList.length > 0 && (
                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider font-bold mb-3 block">Or choose existing</label>
                  <div className="flex flex-wrap gap-2">
                    {categoryList.map(cat => {
                      const style = getFolderStyle(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => setEditCategory(cat)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                            editCategory === cat 
                              ? `${style.bg} ${style.color} ring-1 ring-white/20` 
                              : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          <span>{style.icon}</span>
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
        </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setEditingFile(null)}
                className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-sm transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
          50% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.5); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-slide-in { animation: slide-in 0.4s ease-out both; }
        .animate-slide-in-right { animation: slide-in-right 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        .animate-shimmer { background-size: 200% 100%; animation: shimmer 2s linear infinite; }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

export default App;
 