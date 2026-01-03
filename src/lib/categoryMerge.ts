// Smart folder logic:
// - Categories with ≤3 files → merge into "Other"
// - Categories with 4-20 files → keep as single folder
// - Categories with 20+ files → eligible for subfolders

const MIN_FILES_FOR_FOLDER = 4;  // Less than this goes to "Other"
const MIN_FILES_FOR_SUBFOLDER = 20;  // More than this can have subfolders

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
    const cat = f.proposed_category;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // Find categories that are too small
  const smallCategories = Object.entries(categoryCounts)
    .filter(([_, count]) => count < MIN_FILES_FOR_FOLDER)
    .map(([cat]) => cat);

  // Merge small categories into "Other"
  return files.map(file => {
    if (smallCategories.includes(file.proposed_category)) {
      return {
        ...file,
        proposed_category: "Other",
      };
    }
    return file;
  });
}

/**
 * Check if a category should be subdivided (has 20+ files)
 */
export function shouldSubdivide(categoryCount: number): boolean {
  return categoryCount >= MIN_FILES_FOR_SUBFOLDER;
}

/**
 * Simple category formatter - just capitalize and clean up
 */
export function formatCategory(category: string): string {
  return category
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('_');
}

/**
 * Get folder statistics
 */
export function getFolderStats(files: FileWithCategory[]): {
  categories: string[];
  counts: Record<string, number>;
  largeCategories: string[];  // 20+ files, can be subdivided
  smallCategories: string[];  // <4 files, should be merged
} {
  const counts: Record<string, number> = {};
  files.forEach(f => {
    const cat = f.proposed_category;
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const categories = Object.keys(counts);
  const largeCategories = categories.filter(c => counts[c] >= MIN_FILES_FOR_SUBFOLDER);
  const smallCategories = categories.filter(c => counts[c] < MIN_FILES_FOR_FOLDER);

  return { categories, counts, largeCategories, smallCategories };
}
