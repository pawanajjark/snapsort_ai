import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  FolderOpen, Settings, Sparkles, Folder, 
  Loader2, Check, X, Pencil, CheckCircle2, Circle,
  FolderPlus, ArrowRight
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

function App() {
  const [apiKey, setApiKey] = useState("");
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
      // Auto-select first category
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
    // If category changed, update selected category
    if (editCategory !== editingFile.proposed_category) {
      setSelectedCategory(editCategory);
    }
    setEditingFile(null);
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
  }

  const isLoading = isScanning && processedFiles < totalFiles;
  const hasResults = proposals.length > 0;

  return (
    <div className="h-screen bg-[#0c0c0d] text-white font-['Inter',system-ui,sans-serif] flex flex-col overflow-hidden">

        {/* Header */}
      <header className="shrink-0 border-b border-white/5 bg-[#111113]">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold">Smart Dump</h1>
        </div>

          {/* Config inputs */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                value={path}
                onChange={e => setPath(e.target.value)}
                className="w-64 bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500/50 transition-colors"
                placeholder="Folder path"
              />
            </div>
            <div className="relative">
              <Settings className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-48 bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500/50 transition-colors"
                placeholder="API Key"
              />
          </div>
          <button
              onClick={startScan}
              disabled={!apiKey}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                isScanning 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
                  : 'bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isScanning ? 'Stop' : 'Scan'}
          </button>
          </div>
        </div>

        {/* Progress bar */}
        {isLoading && (
          <div className="h-1 bg-white/5">
            <div 
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
              style={{ width: `${(processedFiles / totalFiles) * 100}%` }}
            />
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Categories/Folders */}
        <aside className="w-64 border-r border-white/5 bg-[#0f0f11] flex flex-col">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Folders to Create
            </h2>
          </div>
          
          <div className="flex-1 overflow-auto p-2">
            {!hasResults && !isLoading && (
              <div className="p-4 text-center text-white/30 text-sm">
                <FolderPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No folders yet</p>
                <p className="text-xs mt-1">Click Scan to analyze screenshots</p>
              </div>
            )}
            
            {isLoading && !hasResults && (
              <div className="p-4 text-center text-white/40 text-sm">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p>Analyzing screenshots...</p>
              </div>
            )}
            
            {categoryList.map(category => {
              const files = categories[category];
              const selectedInCategory = files.filter(f => f.selected).length;
              const isSelected = selectedCategory === category;
              
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-1 group ${
                    isSelected 
                      ? 'bg-violet-500/20 text-white' 
                      : 'hover:bg-white/5 text-white/70'
                  }`}
                >
                  <Folder className={`w-4 h-4 ${isSelected ? 'text-violet-400' : 'text-white/40'}`} />
                  <span className="flex-1 text-sm font-medium truncate">{category}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-violet-500/30 text-violet-300' : 'bg-white/10 text-white/50'
                  }`}>
                    {selectedInCategory}/{files.length}
                  </span>
                </button>
              );
            })}
          </div>
          
          {/* Accept All Button */}
          {hasResults && (
            <div className="p-4 border-t border-white/5">
              <button
                onClick={acceptAll}
                disabled={selectedCount === 0}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 font-semibold text-sm shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Accept All ({selectedCount})
              </button>
              <p className="text-xs text-white/30 text-center mt-2">
                {categoryList.length} folders • {totalCount} files
              </p>
            </div>
          )}
        </aside>

        {/* Middle Panel - Files in Category */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0d]">
          {selectedCategory ? (
            <>
              {/* Category Header */}
              <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Folder className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold">{selectedCategory}</h2>
                  <span className="text-sm text-white/40">
                    {filesInSelectedCategory.length} files
                  </span>
                </div>
                <button
                  onClick={() => toggleCategorySelection(selectedCategory)}
                  className="text-sm text-white/50 hover:text-white flex items-center gap-2 transition-colors"
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
              
              {/* Files List */}
              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-2">
                  {filesInSelectedCategory.map(file => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer ${
                        file.selected 
                          ? 'bg-white/5 border-white/10' 
                          : 'bg-white/[0.02] border-transparent opacity-50'
                      } ${previewFile?.id === file.id ? 'ring-2 ring-violet-500/50' : ''}`}
                      onClick={() => setPreviewFile(file)}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFileSelection(file.id); }}
                        className="shrink-0"
                      >
                        {file.selected ? (
                          <CheckCircle2 className="w-5 h-5 text-violet-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-white/30" />
                        )}
                      </button>
                      
                      {/* Thumbnail */}
                      <div className="w-16 h-12 rounded-lg bg-black/50 overflow-hidden shrink-0">
                        <img 
                          src={convertFileSrc(file.original_path)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      
                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{file.proposed_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                          <span className="truncate">{file.original_name}</span>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          <span className="text-violet-400">{file.proposed_category}/</span>
                        </div>
                      </div>
                      
                      {/* Edit button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(file); }}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors shrink-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/30">
              <div className="text-center">
                <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a folder to view files</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel - Preview */}
        {previewFile && (
          <aside className="w-96 border-l border-white/5 bg-[#0f0f11] flex flex-col">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/60">Preview</h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {/* Large preview */}
              <div className="rounded-xl overflow-hidden bg-black/50 mb-4">
                <img 
                  src={convertFileSrc(previewFile.original_path)}
                  alt=""
                  className="w-full"
                />
              </div>
              
              {/* File details */}
              <div className="space-y-4">
                  <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider">Original</label>
                  <p className="text-sm font-mono text-white/70 mt-1 break-all">{previewFile.original_name}</p>
                  </div>
                
                <div className="flex items-center gap-2 text-white/30">
                  <div className="flex-1 h-px bg-white/10" />
                  <ArrowRight className="w-4 h-4" />
                  <div className="flex-1 h-px bg-white/10" />
                  </div>
                
                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider">New Name</label>
                  <p className="text-sm font-semibold mt-1">{previewFile.proposed_name}</p>
                </div>

                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider">Folder</label>
                  <p className="text-sm text-violet-400 mt-1">{previewFile.proposed_category}/</p>
                </div>

                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider">Reasoning</label>
                  <p className="text-sm text-white/60 mt-1 italic">"{previewFile.reasoning}"</p>
                </div>
                
                <button
                  onClick={() => startEdit(previewFile)}
                  className="w-full py-2 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              </div>
          </div>
          </aside>
        )}
      </div>

      {/* Edit Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#18181b] rounded-2xl border border-white/10 w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">Edit File</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">File Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
              
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Category / Folder</label>
                <input
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
              
              {/* Existing categories */}
              {categoryList.length > 0 && (
                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider mb-2 block">Or choose existing</label>
                  <div className="flex flex-wrap gap-2">
                    {categoryList.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setEditCategory(cat)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          editCategory === cat 
                            ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50' 
                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
        </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingFile(null)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 font-medium text-sm transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
