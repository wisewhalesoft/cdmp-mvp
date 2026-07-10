// Node type definitions for the pipeline editor

export type NodeCategory = 'extract' | 'transform' | 'load';

export interface ToolboxNodeDef {
  type: string;
  label: string;
  category: NodeCategory;
  icon: string; // lucide icon name
}

export const EXTRACT_NODES: ToolboxNodeDef[] = [
  { type: 'raw_data_extract', label: 'Raw Data 擷取', category: 'extract', icon: 'Database' },
];

export const TRANSFORM_NODES: ToolboxNodeDef[] = [
  { type: 'merge', label: '合併 (Merge)', category: 'transform', icon: 'GitMerge' },
  { type: 'field_mapping', label: '欄位對應', category: 'transform', icon: 'Columns' },
  { type: 'format_convert', label: '格式轉換', category: 'transform', icon: 'Type' },
  { type: 'conditional', label: '條件轉換', category: 'transform', icon: 'GitBranch' },
  { type: 'null_handler', label: 'NULL 處理', category: 'transform', icon: 'CircleSlash' },
  { type: 'type_cast', label: '型別轉換', category: 'transform', icon: 'Repeat' },
  { type: 'filter', label: '篩選 (Filter)', category: 'transform', icon: 'Filter' },
  { type: 'dedup', label: '去重', category: 'transform', icon: 'CopyMinus' },
  { type: 'lookup', label: '查找 (Lookup)', category: 'transform', icon: 'Search' },
  { type: 'code_decode', label: '代碼解碼 (Code Decode)', category: 'transform', icon: 'BookMarked' },
  { type: 'string_process', label: '字串處理', category: 'transform', icon: 'TextCursor' },
  { type: 'encrypt', label: '加密脫敏', category: 'transform', icon: 'Shield' },
  { type: 'aggregate', label: '聚合', category: 'transform', icon: 'Sigma' },
  { type: 'derived_field', label: '衍生欄位', category: 'transform', icon: 'Calculator' },
];

export const LOAD_NODES: ToolboxNodeDef[] = [
  { type: 'target_load', label: '目標表載入', category: 'load', icon: 'Upload' },
];

export const ALL_NODE_DEFS: ToolboxNodeDef[] = [
  ...EXTRACT_NODES,
  ...TRANSFORM_NODES,
  ...LOAD_NODES,
];

export function getNodeDef(type: string): ToolboxNodeDef | undefined {
  return ALL_NODE_DEFS.find((d) => d.type === type);
}

export function getCategoryColor(category: NodeCategory) {
  switch (category) {
    case 'extract':
      return {
        border: 'border-l-blue-500',
        icon: 'text-blue-500',
        label: 'text-blue-600',
        badge: 'bg-blue-50 text-blue-700',
        headerBg: 'bg-blue-100',
        headerText: 'text-blue-600',
      };
    case 'transform':
      return {
        border: 'border-l-amber-500',
        icon: 'text-amber-500',
        label: 'text-amber-600',
        badge: 'bg-amber-50 text-amber-700',
        headerBg: 'bg-amber-100',
        headerText: 'text-amber-600',
      };
    case 'load':
      return {
        border: 'border-l-green-500',
        icon: 'text-green-500',
        label: 'text-green-600',
        badge: 'bg-green-50 text-green-700',
        headerBg: 'bg-green-100',
        headerText: 'text-green-600',
      };
  }
}

// Connection validation rules
export function canConnect(sourceType: string, targetType: string): boolean {
  const sourceDef = getNodeDef(sourceType);
  const targetDef = getNodeDef(targetType);
  if (!sourceDef || !targetDef) return false;

  // Load -> anything is not allowed (load is terminal)
  if (sourceDef.category === 'load') return false;
  // anything -> Extract is not allowed (extract is source)
  if (targetDef.category === 'extract') return false;
  // Extract -> Extract not allowed
  if (sourceDef.category === 'extract' && targetDef.category === 'extract') return false;

  return true;
}

export function getCategoryLabel(category: NodeCategory): string {
  switch (category) {
    case 'extract':
      return 'Extract';
    case 'transform':
      return 'Transform';
    case 'load':
      return 'Load';
  }
}
