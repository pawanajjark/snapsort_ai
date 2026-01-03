import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FolderOpen, Check } from "lucide-react";

export interface MovingFile {
  id: string;
  originalPath: string;
  targetPath: string;
  category: string;
  startX: number;
  startY: number;
  delay: number;
}

interface ScanVisualizationProps {
  files: MovingFile[];
  isActive: boolean;
  onComplete: () => void;
}

// Calculate folder positions for targeting
function getFolderPositions(categories: string[], containerHeight: number) {
  const startY = containerHeight / 2 - (Math.min(categories.length, 4) * 70) / 2;
  return categories.slice(0, 4).map((cat, i) => ({
    category: cat,
    x: window.innerWidth - 180,
    y: startY + i * 70,
  }));
}

export function ScanVisualization({
  files,
  isActive,
  onComplete,
}: ScanVisualizationProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [folderBounce, setFolderBounce] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) {
      setCompletedIds(new Set());
      setShowSuccess(false);
      setFolderBounce(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (completedIds.size === files.length && files.length > 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [completedIds, files.length, onComplete]);

  const handleFileComplete = useCallback((id: string, category: string) => {
    setCompletedIds((prev) => new Set([...prev, id]));
    // Trigger folder bounce
    setFolderBounce(category);
    setTimeout(() => setFolderBounce(null), 300);
  }, []);

  if (!isActive || files.length === 0) return null;

  const categories = [...new Set(files.map((f) => f.category))];
  const folderPositions = getFolderPositions(categories, window.innerHeight);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md"
    >
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="relative w-full h-full">
        {/* Source thumbnails area (left side) */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center"
          >
            {/* Source folder icon */}
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 mb-3">
              <FolderOpen className="w-8 h-8 text-white/40" />
            </div>
            <p className="text-[13px] text-white/50 font-medium">Desktop</p>
            <p className="text-[11px] text-white/30 mt-1">{files.length} files</p>
            
            {/* Thumbnail stack preview */}
            <div className="mt-4 relative w-24 h-24">
              {files.slice(0, 3).map((file, i) => (
                <motion.div
                  key={file.id + "-stack"}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 0.6 - i * 0.2, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="absolute rounded-lg overflow-hidden border border-white/20 shadow-xl"
                  style={{
                    width: 70 - i * 10,
                    height: 50 - i * 8,
                    top: i * 8,
                    left: i * 8,
                    zIndex: 3 - i,
                  }}
                >
                  <img
                    src={convertFileSrc(file.originalPath)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Destination folders (right side) */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 space-y-3">
          {categories.slice(0, 4).map((category, index) => {
            const categoryFiles = files.filter((f) => f.category === category);
            const completedCount = categoryFiles.filter((f) =>
              completedIds.has(f.id)
            ).length;
            const isComplete = completedCount === categoryFiles.length;
            const isBouncing = folderBounce === category;

            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, x: 30 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  scale: isBouncing ? 1.1 : 1,
                }}
                transition={{ 
                  delay: 0.1 + index * 0.08,
                  scale: { type: "spring", stiffness: 500, damping: 15 }
                }}
                className="flex items-center gap-4"
              >
                <motion.div
                  animate={{
                    backgroundColor: isComplete ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.05)",
                    borderColor: isComplete ? "rgba(34, 197, 94, 0.4)" : "rgba(255, 255, 255, 0.1)",
                  }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center border-2 transition-all"
                >
                  <AnimatePresence mode="wait">
                    {isComplete ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      >
                        <Check className="w-6 h-6 text-green-400" />
                      </motion.div>
                    ) : (
                      <motion.div key="folder">
                        <FolderOpen className="w-6 h-6 text-white/40" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                <div>
                  <p className="text-[13px] text-white/80 font-medium">
                    {category}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-white/60"
                        initial={{ width: 0 }}
                        animate={{ width: `${(completedCount / categoryFiles.length) * 100}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                    <span className="text-[10px] text-white/30">
                      {completedCount}/{categoryFiles.length}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {categories.length > 4 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-[11px] text-white/30 pl-2"
            >
              +{categories.length - 4} more folders
            </motion.p>
          )}
        </div>

        {/* Animated flying thumbnails */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {files.map((file, index) => {
            const folderPos = folderPositions.find(f => f.category === file.category);
            return (
              <AnimatedThumbnail
                key={file.id}
                file={file}
                index={index}
                targetX={folderPos?.x ?? window.innerWidth - 200}
                targetY={folderPos?.y ?? window.innerHeight / 2}
                onComplete={() => handleFileComplete(file.id, file.category)}
              />
            );
          })}
        </div>

        {/* Progress indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="bg-white/5 backdrop-blur-sm rounded-full px-6 py-3 border border-white/10">
            <div className="flex items-center gap-4">
              <div className="text-[13px] text-white/60">
                Organizing {completedIds.size} of {files.length}
              </div>
              <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-white/60 to-white"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(completedIds.size / files.length) * 100}%`,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Success overlay */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-24 h-24 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-6 border border-green-500/30"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  >
                    <Check className="w-12 h-12 text-green-400" />
                  </motion.div>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-[18px] text-white font-medium"
                >
                  All Done!
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-[14px] text-white/50 mt-2"
                >
                  {files.length} screenshots organized into {categories.length} folders
                </motion.p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Individual animated thumbnail with arc motion and spring physics
function AnimatedThumbnail({
  file,
  index,
  targetX,
  targetY,
  onComplete,
}: {
  file: MovingFile;
  index: number;
  targetX: number;
  targetY: number;
  onComplete: () => void;
}) {
  const controls = useAnimation();
  const [phase, setPhase] = useState<"waiting" | "moving" | "landing" | "done">("waiting");
  const [imageLoaded, setImageLoaded] = useState(false);

  // Stagger delay - max 5 files animating at once
  const staggerDelay = Math.min(index * 150, 2000);
  
  // Calculate start position (stacked on the left)
  const startX = 180;
  const startY = window.innerHeight / 2 - 30 + (index % 5) * 15;
  
  // Arc peak (higher arc for more dramatic effect)
  const arcHeight = 120 + Math.random() * 40;
  const midX = (startX + targetX) / 2;
  const midY = Math.min(startY, targetY) - arcHeight;

  useEffect(() => {
    const startAnimation = async () => {
      // Wait for stagger delay
      await new Promise(resolve => setTimeout(resolve, staggerDelay));
      
      if (phase !== "waiting") return;
      setPhase("moving");

      // Arc motion with spring physics
      await controls.start({
        x: [startX, midX, targetX],
        y: [startY, midY, targetY],
        scale: [1, 0.8, 0.4],
        rotate: [0, -15, 5],
        opacity: [1, 1, 0.8],
        transition: {
          duration: 0.5,
          times: [0, 0.4, 1],
          ease: [0.25, 0.1, 0.25, 1], // Custom cubic bezier for arc
          scale: {
            times: [0, 0.5, 1],
            ease: "easeInOut",
          },
        },
      });

      // Landing bounce
      setPhase("landing");
      await controls.start({
        scale: [0.4, 0.5, 0.35],
        opacity: 0,
        transition: {
          duration: 0.15,
          scale: {
            type: "spring",
            stiffness: 400,
            damping: 10,
          },
        },
      });

      setPhase("done");
      onComplete();
    };

    startAnimation();
  }, []);

  if (phase === "done") return null;

  return (
    <motion.div
      animate={controls}
      initial={{
        x: startX,
        y: startY,
        scale: 1,
        rotate: 0,
        opacity: phase === "waiting" ? 0.4 : 1,
      }}
      className="absolute origin-center"
      style={{ zIndex: 100 - index }}
    >
      <div 
        className={`
          w-16 h-12 rounded-lg overflow-hidden 
          shadow-2xl border-2 border-white/30
          ${phase === "moving" ? "shadow-white/20" : ""}
        `}
        style={{
          boxShadow: phase === "moving" 
            ? "0 10px 40px rgba(255,255,255,0.15), 0 0 20px rgba(255,255,255,0.1)"
            : "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        {!imageLoaded && (
          <div className="w-full h-full bg-white/10 animate-pulse" />
        )}
        <motion.img
          src={convertFileSrc(file.originalPath)}
          alt=""
          className="w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
      
      {/* Motion trail effect */}
      {phase === "moving" && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-white/10 blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.3 }}
        />
      )}
    </motion.div>
  );
}

// Helper to create moving file data from proposals
export function createMovingFiles(
  proposals: Array<{
    id: string;
    original_path: string;
    proposed_category: string;
  }>
): MovingFile[] {
  return proposals.map((p, i) => ({
    id: p.id,
    originalPath: p.original_path,
    targetPath: p.proposed_category,
    category: p.proposed_category.split("/")[0],
    startX: 180,
    startY: window.innerHeight / 2 + (i % 5) * 15,
    delay: i * 150,
  }));
}
