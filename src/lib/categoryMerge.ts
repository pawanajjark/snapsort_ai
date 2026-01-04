// Smart folder logic:
// - Categories with ≤3 files → merge into "Other"

const MIN_FILES_FOR_FOLDER = 3;  // Less than this goes to "Other"

export interface FileWithCategory {
  id: string;
  proposed_category: string;
  [key: string]: any;
}

/**
 * Optimizes folder structure by merging small categories
 * Call this AFTER all files have been analyzed
 */
export function optimizeFolderStructure<T extends FileWithCategory>(
  files: T[]
): T[] {
  // Count files per category
  const categoryCounts: Record<string, number> = {};
  files.forEach(f => {
    const topLevel = f.proposed_category.split('/')[0];
    categoryCounts[topLevel] = (categoryCounts[topLevel] || 0) + 1;
  });

  // Find categories that are too small
  const smallCategories = Object.entries(categoryCounts)
    .filter(([_, count]) => count < MIN_FILES_FOR_FOLDER)
    .map(([cat]) => cat);

  // Merge small categories into "Other"
  return files.map(file => {
    const topLevel = file.proposed_category.split('/')[0];
    if (smallCategories.includes(topLevel)) {
      return {
        ...file,
        proposed_category: "Other",
      };
    }
    return file;
  });
}

/**
 * Simple category formatter - just capitalize and clean up
 */
export function formatCategory(category: string): string {
  return category
    .split('/')
    .map(segment => segment
      .replace(/[_-]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('_')
    )
    .filter(Boolean)
    .join('/');
}

const MIN_SUBFOLDER_SIZE = 3;

/**
 * Cleanup small subfolders (merge back to parent)
 */
export function cleanupSubfolders<T extends FileWithCategory>(files: T[]): T[] {
  // Count files per subfolder
  const subfolderCounts: Record<string, number> = {};

  files.forEach(f => {
    // Only count if it's a subfolder
    if (f.proposed_category.includes('/')) {
      subfolderCounts[f.proposed_category] = (subfolderCounts[f.proposed_category] || 0) + 1;
    }
  });

  // Identify small subfolders
  const smallSubfolders = Object.entries(subfolderCounts)
    .filter(([_, count]) => count < MIN_SUBFOLDER_SIZE)
    .map(([cat]) => cat);

  if (smallSubfolders.length === 0) return files;

  console.log("[MERGE] Merging small subfolders:", smallSubfolders);

  return files.map(file => {
    if (smallSubfolders.includes(file.proposed_category)) {
      // "Finance/Invoices" -> "Finance"
      const parentCategory = file.proposed_category.split('/')[0];
      return {
        ...file,
        proposed_category: parentCategory
      };
    }
    return file;
  });
}
