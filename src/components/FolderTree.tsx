import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  fileCount: number;
  selectedCount: number;
}

interface FolderTreeProps {
  folders: FolderNode[];
  selectedPath: string | null;
  onSelectFolder: (path: string) => void;
}

function buildFolderTree(categories: string[], fileCounts: Record<string, { total: number; selected: number }>): FolderNode[] {
  const nodeMap = new Map<string, FolderNode>();

  // Create all nodes
  categories.forEach(category => {
    const parts = category.split('/');
    let currentPath = '';
    const counts = fileCounts[category];

    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!nodeMap.has(currentPath)) {
        nodeMap.set(currentPath, {
          name: part,
          path: currentPath,
          children: [],
          fileCount: 0,
          selectedCount: 0,
        });
      }

      if (counts) {
        const node = nodeMap.get(currentPath)!;
        node.fileCount += counts.total;
        node.selectedCount += counts.selected;
      }
    });
  });

  // Build tree structure
  const rootNodes: FolderNode[] = [];
  
  nodeMap.forEach((node, path) => {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
      // Root node
      rootNodes.push(node);
    } else {
      // Child node - find parent and add
      const parentPath = path.substring(0, lastSlash);
      const parent = nodeMap.get(parentPath);
      if (parent && !parent.children.find(c => c.path === path)) {
        parent.children.push(node);
      }
    }
  });

  // Sort children alphabetically
  const sortChildren = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => sortChildren(node.children));
  };
  sortChildren(rootNodes);

  return rootNodes;
}

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isLast: boolean;
}

function FolderItem({ node, depth, selectedPath, onSelect, isLast }: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedPath === node.path;
  const isInSelectedPath = selectedPath?.startsWith(node.path + '/') || false;
  const folderKey = encodeURIComponent(node.path);

  return (
    <div>
      <motion.button
        onClick={() => {
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
          onSelect(node.path);
        }}
        data-folder-key={folderKey}
        className={`
          w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg
          transition-colors duration-100
          ${isSelected 
            ? 'bg-white/10 text-white' 
            : isInSelectedPath 
              ? 'bg-white/5 text-white/80' 
              : 'text-white/60 hover:bg-white/5 hover:text-white/80'
          }
        `}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
      >
        {/* Expand/Collapse Arrow */}
        {hasChildren && (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="w-3 h-3 text-white/40" />
          </motion.div>
        )}
        {!hasChildren && <div className="w-3" />}

        {/* Folder Icon */}
        {isSelected || isExpanded ? (
          <FolderOpen className="w-4 h-4 text-white/60" />
        ) : (
          <Folder className="w-4 h-4 text-white/40" />
        )}

        {/* Folder Name */}
        <span className="flex-1 text-[13px] font-medium truncate">
          {node.name}
        </span>

        {/* File Count Badge */}
        {node.fileCount > 0 && (
          <span className={`
            text-[11px] font-medium px-1.5 py-0.5 rounded
            ${isSelected 
              ? 'bg-white/20 text-white' 
              : 'bg-white/5 text-white/40'
            }
          `}>
            {node.selectedCount}/{node.fileCount}
          </span>
        )}
      </motion.button>

      {/* Children */}
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {node.children.map((child, index) => (
              <FolderItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                isLast={index === node.children.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FolderTree({ folders, selectedPath, onSelectFolder }: FolderTreeProps) {
  if (folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Folder className="w-10 h-10 text-white/20 mb-3" />
        <p className="text-[13px] text-white/40">No folders yet</p>
        <p className="text-[11px] text-white/25 mt-1">Scan to organize screenshots</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" data-folder-tree>
      <div className="p-2">
        {folders.map((folder, index) => (
          <FolderItem
            key={folder.path}
            node={folder}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelectFolder}
            isLast={index === folders.length - 1}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

export { buildFolderTree };
export type { FolderNode };
