import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Play, Square, FileText, Settings, Ghost, Check, X, ArrowRight, Loader2 } from "lucide-react";

interface FileProposal {
  id: string;
  original_path: string;
  original_name: string;
  proposed_name: string;
  proposed_category: string;
  reasoning: string;
}

interface FileLog {
  original: string;
  new: string;
  category: string;
  status: string;
  timestamp: string;
}

function App() {
  const [apiKey, setApiKey] = useState("");
  const [path, setPath] = useState("/Users/pawan/Desktop");
  const [isWatching, setIsWatching] = useState(false);
  const [proposals, setProposals] = useState<FileProposal[]>([]);
  const [logs, setLogs] = useState<FileLog[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isTauriAvailable, setIsTauriAvailable] = useState(true);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    console.log("[FRONTEND] App mounted!");
    console.log("[FRONTEND] invoke function:", invoke);
    console.log("[FRONTEND] listen function:", listen);
    
    // Check if Tauri API is available
    if (!invoke || !listen) {
      setIsTauriAvailable(false);
      addDebugLog("⚠️ NOT RUNNING IN TAURI! Open the app window, not browser.");
      console.error("[FRONTEND] Tauri API not available!");
      return;
    }
    
    console.log("[FRONTEND] Setting up event listeners...");
    addDebugLog("🔧 Setting up event listeners...");
    
    const unlistenProposed = listen("file-proposed", (event: any) => {
      console.log("[FRONTEND] ✅ RECEIVED file-proposed event!", event);
      console.log("[FRONTEND] Payload:", event.payload);
      addDebugLog(`✅ PROPOSAL: "${event.payload.proposed_name}" → ${event.payload.proposed_category}`);
      addDebugLog(`💭 Reasoning: ${event.payload.reasoning}`);
      setProposals((prev) => [event.payload, ...prev]);
    });

    const unlistenProcessing = listen("file-processing", (event: any) => {
      console.log("[FRONTEND] 🔍 RECEIVED file-processing event!", event);
      console.log("[FRONTEND] Payload:", event.payload);
      addDebugLog(`🔍 DETECTED: ${event.payload}`);
      addDebugLog(`📡 Sending to Claude API...`);
      setStatusMsg(`Analyzing ${event.payload}...`);
      setTimeout(() => setStatusMsg(""), 3000);
    });

    console.log("[FRONTEND] Event listeners registered!");
    addDebugLog("✅ Event listeners ready!");

    return () => {
      unlistenProposed.then((f) => f());
      unlistenProcessing.then((f) => f());
    };
  }, []);

  async function toggleWatch() {
    console.log("[FRONTEND] toggleWatch called");
    console.log("[FRONTEND] typeof invoke:", typeof invoke);
    
    if (!invoke) {
      const errorMsg = "Tauri invoke API is not available. Are you running in a Tauri app?";
      console.error("[FRONTEND]", errorMsg);
      addDebugLog(`❌ ${errorMsg}`);
      alert(errorMsg);
      return;
    }
    
    if (isWatching) {
      console.log("[FRONTEND] Stopping watch...");
      await invoke("stop_watch");
      setIsWatching(false);
      addDebugLog("⏹️ STOPPED watching");
    } else {
      try {
        console.log("[FRONTEND] Starting watch...");
        console.log("[FRONTEND] Path:", path);
        console.log("[FRONTEND] API Key length:", apiKey.length);
        addDebugLog(`🚀 Calling start_watch...`);
        
        const result = await invoke("start_watch", { path, apiKey });
        console.log("[FRONTEND] start_watch returned:", result);
        
        setIsWatching(true);
        addDebugLog(`▶️ STARTED watching: ${path}`);
        addDebugLog(`📂 Waiting for screenshot files...`);
      } catch (e) {
        alert("Error: " + e);
        addDebugLog(`❌ ERROR: ${e}`);
        console.error("[FRONTEND] Error:", e);
      }
    }
  }

  async function handleAction(proposal: FileProposal, approve: boolean) {
    if (approve) {
      addDebugLog(`✅ USER APPROVED: ${proposal.proposed_name}`);
      const parentDir = proposal.original_path.substring(0, proposal.original_path.lastIndexOf('/'));
      const newPath = `${parentDir}/${proposal.proposed_category}/${proposal.proposed_name}`;

      try {
        await invoke("execute_action", {
          originalPath: proposal.original_path,
          newPath: newPath
        });

        addDebugLog(`📁 MOVED: ${proposal.original_path} → ${newPath}`);
        setLogs(prev => [{
          original: proposal.original_name,
          new: proposal.proposed_name,
          category: proposal.proposed_category,
          status: "Success",
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      } catch (e) {
        alert("Failed to move: " + e);
        addDebugLog(`❌ MOVE FAILED: ${e}`);
        return;
      }
    } else {
      addDebugLog(`🚫 USER REJECTED: ${proposal.original_name}`);
    }
    setProposals(prev => prev.filter(p => p.id !== proposal.id));
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      {!isTauriAvailable && (
        <div className="max-w-2xl mx-auto mb-4 bg-red-100 border-2 border-red-500 text-red-900 px-6 py-4 rounded-2xl">
          <h2 className="font-bold text-lg mb-2">⚠️ Not Running in Tauri App</h2>
          <p className="text-sm">
            You're viewing this in a regular web browser. The app will NOT work here!
            <br />
            <strong>Look for the native app window that opened when you ran `npm run tauri dev`</strong>
          </p>
        </div>
      )}
      
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <Ghost className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Smart Dump</h1>
              <p className="text-sm text-gray-500 font-medium">Review Queue</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${isWatching ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
            {isWatching ? "WATCHING" : "IDLE"}
          </div>
        </div>

        {/* Controls Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOpen className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-xs"
              />
            </div>
            <div className="relative flex-1">
              <Settings className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-xs"
              />
            </div>
          </div>
          <button
            onClick={toggleWatch}
            className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
              ${isWatching
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/25"
                : "bg-gray-900 hover:bg-black shadow-gray-900/25"
              }`}
          >
            {isWatching ? "Stop Watching" : "Start Watching"}
          </button>
        </div>

        {/* Pending Proposals */}
        {proposals.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Pending Approval ({proposals.length})
            </h2>
            {proposals.map((p) => (
              <div key={p.id} className="bg-white p-5 rounded-3xl shadow-lg ring-1 ring-blue-100 relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Found Screenshot</div>
                    <div className="font-mono text-sm text-gray-600 truncate max-w-[200px]">{p.original_name}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-300 mt-4" />
                  <div className="text-right">
                    <div className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-1">Proposal</div>
                    <div className="font-bold text-gray-900">{p.proposed_name}</div>
                    <div className="text-xs text-gray-500 mt-1">in <span className="font-semibold text-gray-700">{p.proposed_category}</span></div>
                  </div>
                </div>

                <div className="bg-blue-50/50 p-3 rounded-xl text-xs text-blue-700 mb-4 italic">
                  "{p.reasoning}"
                </div>

                <div className="flex gap-3">
                  <button onClick={() => handleAction(p, false)} className="flex-1 py-2 rounded-xl border border-gray-200 font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                    Reject
                  </button>
                  <button onClick={() => handleAction(p, true)} className="flex-1 py-2 rounded-xl bg-blue-600 font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-colors">
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Debug Log */}
        <div className="bg-black text-green-400 rounded-2xl p-5 font-mono text-xs overflow-hidden">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3 text-green-300">🔍 Live Activity Log</h2>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {debugLog.length === 0 ? (
              <div className="text-gray-500 italic">Waiting for events...</div>
            ) : (
              debugLog.map((log, i) => (
                <div key={i} className="leading-relaxed">{log}</div>
              ))
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="space-y-4 opacity-60 hover:opacity-100 transition-opacity">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">History</h2>
          {logs.map((log, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 pb-2">
              <span>{log.original} &rarr; {log.new}</span>
              <span className="font-mono">{log.timestamp}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// End of App
export default App;
