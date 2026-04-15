import { useState, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { MousePointerClick, Trash2, Plus, Lock, ChevronDown, CheckCircle, MinusCircle, AlertCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getNodeDef, getCategoryColor, getCategoryLabel } from './node-types';
import { FieldFlowTab } from './field-flow-tab';
import type { RawTableItem, TargetTableSummary, TargetTableColumn } from '@cdmp/shared';
import { getTargetTables, getTargetTableSchema, getRawTableColumns } from '@/api/etl-pipelines';
import { getUpstreamColumns } from './node-field-stats';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  rawTables: RawTableItem[];
  nodes: Node[];
  edges: Edge[];
  onNodeDataChange: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function PropertiesPanel({
  selectedNode,
  rawTables,
  nodes,
  edges,
  onNodeDataChange,
  onDeleteNode,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'fields'>('settings');

  // Reset tab when selected node changes
  useEffect(() => {
    setActiveTab('settings');
  }, [selectedNode?.id]);

  if (!selectedNode) {
    return (
      <aside
        className="w-[320px] bg-white border-l border-[#E5E7EB] overflow-y-auto flex-shrink-0"
        data-testid="properties-panel"
      >
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <MousePointerClick className="w-12 h-12 mb-3" />
          <p className="text-sm">點擊節點以編輯屬性</p>
        </div>
      </aside>
    );
  }

  const nodeData = selectedNode.data as Record<string, unknown>;
  const nodeType = nodeData.nodeType as string;
  const nodeDef = getNodeDef(nodeType);

  if (!nodeDef) {
    return (
      <aside
        className="w-[320px] bg-white border-l border-[#E5E7EB] overflow-y-auto flex-shrink-0"
        data-testid="properties-panel"
      >
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <p className="text-sm">未知的節點類型</p>
        </div>
      </aside>
    );
  }

  const colors = getCategoryColor(nodeDef.category);

  const updateData = (updates: Record<string, unknown>) => {
    onNodeDataChange(selectedNode.id, updates);
  };

  const renderProperties = () => {
    switch (nodeType) {
      case 'raw_data_extract':
        return <ExtractProperties nodeData={nodeData} rawTables={rawTables} onChange={updateData} />;
      case 'null_handler':
        return <NullHandlerProperties nodeData={nodeData} onChange={updateData} />;
      case 'format_convert':
        return <FormatProperties nodeData={nodeData} onChange={updateData} />;
      case 'type_cast':
        return <TypeCastProperties nodeData={nodeData} onChange={updateData} />;
      case 'target_load':
        return <LoadProperties nodeData={nodeData} onChange={updateData} nodeId={selectedNode.id} nodes={nodes} edges={edges} />;
      case 'merge':
        return <MergeProperties nodeData={nodeData} onChange={updateData} nodeId={selectedNode.id} nodes={nodes} edges={edges} />;
      case 'field_mapping':
        return <FieldMappingProperties nodeData={nodeData} onChange={updateData} />;
      case 'conditional':
        return <ConditionalProperties nodeData={nodeData} onChange={updateData} />;
      case 'filter':
        return <FilterProperties nodeData={nodeData} onChange={updateData} />;
      case 'dedup':
        return <DedupProperties nodeData={nodeData} onChange={updateData} />;
      case 'lookup':
        return <LookupProperties nodeData={nodeData} rawTables={rawTables} onChange={updateData} nodeId={selectedNode.id} nodes={nodes} edges={edges} />;
      case 'string_process':
        return <StringProcessProperties nodeData={nodeData} onChange={updateData} />;
      case 'encrypt':
        return <EncryptProperties nodeData={nodeData} onChange={updateData} />;
      case 'aggregate':
        return <AggregateProperties nodeData={nodeData} onChange={updateData} />;
      case 'derived_field':
        return <DerivedFieldProperties nodeData={nodeData} onChange={updateData} />;
      default:
        return <GenericTransformProperties nodeData={nodeData} onChange={updateData} />;
    }
  };

  return (
    <aside
      className="w-[320px] bg-white border-l border-[#E5E7EB] overflow-y-auto flex-shrink-0"
      data-testid="properties-panel"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}
            >
              {getCategoryLabel(nodeDef.category)}
            </span>
            <input
              type="text"
              value={(nodeData.label as string) || ''}
              placeholder={nodeDef.label}
              onChange={(e) => onNodeDataChange(selectedNode.id, { label: e.target.value })}
              className="text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#2563EB] focus:outline-none min-w-0 flex-1"
              data-testid="node-name-input"
            />
          </div>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="text-gray-400 hover:text-red-500"
            data-testid="delete-node-btn"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-[#E5E7EB]" data-testid="properties-tabs">
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium ${
            activeTab === 'settings'
              ? 'text-[#2563EB] border-b-2 border-[#2563EB]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('settings')}
          data-testid="tab-settings"
        >
          設定
        </button>
        <button
          className={`flex-1 px-4 py-2 text-xs font-medium ${
            activeTab === 'fields'
              ? 'text-[#2563EB] border-b-2 border-[#2563EB]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('fields')}
          data-testid="tab-fields"
        >
          欄位流
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' ? (
        <div className="p-4 space-y-4">
          {renderProperties()}
        </div>
      ) : (
        <FieldFlowTab nodeId={selectedNode.id} nodes={nodes} edges={edges} />
      )}
    </aside>
  );
}

// --- Shared styles & helpers ---

const inputClass =
  'w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]';
const selectClass = inputClass;
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const smallInputClass =
  'w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]';
const smallLabelClass = 'block text-xs text-gray-500 mb-1';

interface SimplePropsBase {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2 text-sm text-[#2563EB] border border-dashed border-[#2563EB] rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

function ItemHeader({ index, label, onRemove }: { index: number; label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500">{label} {index + 1}</span>
      <button onClick={onRemove} className="text-gray-400 hover:text-[#EF4444]">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  testId,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [newTag, setNewTag] = useState('');

  const handleAdd = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onAdd(newTag.trim());
      setNewTag('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-[#E5E7EB] rounded-lg min-h-[36px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
        >
          {tag}
          <button onClick={() => onRemove(tag)} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        value={newTag}
        onChange={(e) => setNewTag(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        onBlur={handleAdd}
        placeholder={placeholder}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent"
        data-testid={testId}
      />
    </div>
  );
}

// --- Extract Properties ---

function ExtractProperties({
  nodeData,
  rawTables,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  rawTables: RawTableItem[];
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const selectedTable = (nodeData.rawTable as string) || '';
  const selectedInfo = rawTables.find((t) => t.rawTableName === selectedTable);

  return (
    <div>
      <label className={labelClass}>
        Raw Data 來源表 <span className="text-[#EF4444]">*</span>
      </label>
      <select
        className={selectClass}
        value={selectedTable}
        onChange={(e) => {
          const selected = rawTables.find((t) => t.rawTableName === e.target.value);
          onChange({
            rawTable: e.target.value,
            subtitle: selected?.taskName || undefined,
          });
        }}
        data-testid="extract-raw-table-select"
      >
        <option value="">選擇 Raw Data 表</option>
        {rawTables.map((t) => (
          <option key={t.rawTableName} value={t.rawTableName}>
            {t.rawTableName}（{t.taskName}）
          </option>
        ))}
      </select>
      {selectedInfo && (
        <>
          <p className="text-xs text-gray-400 mt-1">
            來源：{selectedInfo.datasourceName} / {selectedInfo.sourceTable}
          </p>
          {selectedInfo.lastExecutionAt && (
            <p className="text-xs text-gray-400">
              最後擷取：{new Date(selectedInfo.lastExecutionAt).toLocaleString('zh-TW')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// --- NullHandler Properties ---

function NullHandlerProperties({ nodeData, onChange }: SimplePropsBase) {
  const columns = (nodeData.columns as string[]) || [];
  const strategy = (nodeData.strategy as string) || 'default_value';
  const defaultValue = (nodeData.defaultValue as string) || '';
  const [newCol, setNewCol] = useState('');

  const addColumn = () => {
    if (newCol.trim() && !columns.includes(newCol.trim())) {
      onChange({ columns: [...columns, newCol.trim()] });
      setNewCol('');
    }
  };

  const removeColumn = (col: string) => {
    onChange({ columns: columns.filter((c) => c !== col) });
  };

  return (
    <>
      <div>
        <label className={labelClass}>欄位選擇</label>
        <div className="flex flex-wrap gap-1.5 p-2 border border-[#E5E7EB] rounded-lg min-h-[36px]">
          {columns.map((col) => (
            <span
              key={col}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
            >
              {col}
              <button
                onClick={() => removeColumn(col)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            onBlur={addColumn}
            placeholder="輸入欄位名稱..."
            className="flex-1 min-w-[80px] text-xs outline-none bg-transparent"
            data-testid="null-handler-column-input"
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>處理策略</label>
        <select
          className={selectClass}
          value={strategy}
          onChange={(e) => {
            onChange({
              strategy: e.target.value,
              subtitle: `strategy: ${e.target.value}`,
            });
          }}
          data-testid="null-handler-strategy-select"
        >
          <option value="default_value">預設值 (default_value)</option>
          <option value="delete_row">刪除列 (delete_row)</option>
          <option value="fill_forward">前值填充 (fill_forward)</option>
          <option value="fill_backward">後值填充 (fill_backward)</option>
          <option value="fixed_value">固定值 (fixed_value)</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>預設值</label>
        <input
          type="text"
          className={inputClass}
          value={defaultValue}
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          data-testid="null-handler-default-input"
        />
      </div>
    </>
  );
}

// --- Format Properties ---

interface FormatRule {
  field: string;
  formatType: string;
  sourceFormat: string;
  targetFormat: string;
}

function FormatProperties({ nodeData, onChange }: SimplePropsBase) {
  const rules = (nodeData.rules as FormatRule[]) || [];

  const addRule = () => {
    onChange({
      rules: [...rules, { field: '', formatType: 'date', sourceFormat: '', targetFormat: '' }],
    });
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    onChange({ rules: newRules });
  };

  const updateRule = (index: number, updates: Partial<FormatRule>) => {
    const newRules = rules.map((r, i) => (i === index ? { ...r, ...updates } : r));
    onChange({ rules: newRules });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">轉換規則</div>
      {rules.map((rule, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="規則" onRemove={() => removeRule(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={rule.field}
              onChange={(e) => updateRule(index, { field: e.target.value })}
            />
          </div>
          <div>
            <label className={smallLabelClass}>格式類型</label>
            <select
              className={smallInputClass}
              value={rule.formatType}
              onChange={(e) => updateRule(index, { formatType: e.target.value })}
            >
              <option value="date">date</option>
              <option value="number">number</option>
              <option value="string">string</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={smallLabelClass}>來源格式</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                value={rule.sourceFormat}
                onChange={(e) => updateRule(index, { sourceFormat: e.target.value })}
              />
            </div>
            <div>
              <label className={smallLabelClass}>目標格式</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                value={rule.targetFormat}
                onChange={(e) => updateRule(index, { targetFormat: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
      <AddButton onClick={addRule} label="新增規則" />
    </>
  );
}

// --- TypeCast Properties ---

interface TypeCastItem {
  column: string;
  sourceType: string;
  targetType: string;
}

function TypeCastProperties({ nodeData, onChange }: SimplePropsBase) {
  const casts = (nodeData.castRules as TypeCastItem[]) || [];

  const addCast = () => {
    onChange({
      castRules: [...casts, { column: '', sourceType: 'VARCHAR', targetType: 'VARCHAR' }],
    });
  };

  const removeCast = (index: number) => {
    onChange({ castRules: casts.filter((_, i) => i !== index) });
  };

  const updateCast = (index: number, updates: Partial<TypeCastItem>) => {
    const newCasts = casts.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ castRules: newCasts });
  };

  const TYPE_OPTIONS = [
    'VARCHAR', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TEXT', 'UUID',
  ];

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">轉換清單</div>
      {casts.map((cast, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="項目" onRemove={() => removeCast(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={cast.column}
              onChange={(e) => updateCast(index, { column: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={smallLabelClass}>來源型別</label>
              <input
                type="text"
                value={cast.sourceType}
                disabled
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className={smallLabelClass}>目標型別</label>
              <select
                className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                value={cast.targetType}
                onChange={(e) => updateCast(index, { targetType: e.target.value })}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}
      <AddButton onClick={addCast} label="新增轉換" />
    </>
  );
}

// --- Load Properties (API-driven, F036 AC-3/AC-4) ---

// A~H category definitions for customer_core schema
interface LoadCategory {
  id: string;
  label: string;
  badgeBg: string;
  badgeText: string;
}

const LOAD_CATEGORIES: LoadCategory[] = [
  { id: 'A', label: '識別與分類', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700' },
  { id: 'B', label: '個人屬性', badgeBg: 'bg-green-100', badgeText: 'text-green-700' },
  { id: 'C', label: '聯絡資訊', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
  { id: 'D', label: '地址', badgeBg: 'bg-purple-100', badgeText: 'text-purple-700' },
  { id: 'E', label: '職業與就業', badgeBg: 'bg-rose-100', badgeText: 'text-rose-700' },
  { id: 'F', label: '財務與風控', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700' },
  { id: 'G', label: '企業客戶專屬', badgeBg: 'bg-teal-100', badgeText: 'text-teal-700' },
  { id: 'H', label: '稽核與 ETL 追蹤', badgeBg: 'bg-gray-200', badgeText: 'text-gray-600' },
];

function groupColumnsByCategory(columns: TargetTableColumn[]) {
  return LOAD_CATEGORIES.map((category) => ({
    category,
    columns: columns.filter((c) => c.category === category.id),
  }));
}

function LoadProperties({
  nodeData,
  onChange,
  nodeId,
  nodes,
  edges,
}: SimplePropsBase & { nodeId: string; nodes: Node[]; edges: Edge[] }) {
  const targetTable = (nodeData.targetTable as string) || '';
  const [tables, setTables] = useState<TargetTableSummary[]>([]);
  const [schemaColumns, setSchemaColumns] = useState<TargetTableColumn[]>([]);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  // Category A expanded by default, B~H collapsed
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ A: true });

  // Load target table list from API
  useEffect(() => {
    getTargetTables()
      .then((res) => setTables(res.data))
      .catch(() => {});
  }, []);

  // Stable fingerprint for upstream column computation
  const edgeKey = edges.map((e) => `${e.source}>${e.target}`).join(',');
  const nodeDataKey = nodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    return `${n.id}:${d.nodeType}:${d.rawTable || ''}:${d.dropUnmapped || ''}:${JSON.stringify(d.mappings || d.expressions || d.castRules || d.rules || '')}`;
  }).join(';');
  const upstreamFingerprint = `${nodeId}|${edgeKey}|${nodeDataKey}`;
  const prevUpstreamFingerprintRef = useRef('');

  // Compute source columns from the upstream pipeline graph
  useEffect(() => {
    if (upstreamFingerprint === prevUpstreamFingerprintRef.current) return;
    prevUpstreamFingerprintRef.current = upstreamFingerprint;

    getUpstreamColumns(nodeId, nodes, edges)
      .then((cols) => setSourceColumns(cols.sort()))
      .catch(() => setSourceColumns([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upstreamFingerprint]);

  // Load schema columns when target table changes
  useEffect(() => {
    if (!targetTable) {
      setSchemaColumns([]);
      return;
    }
    setLoadingSchema(true);
    getTargetTableSchema(targetTable)
      .then((res) => setSchemaColumns(res.columns))
      .catch(() => setSchemaColumns([]))
      .finally(() => setLoadingSchema(false));
  }, [targetTable]);

  const etlTrackingFields = schemaColumns.filter((c) => c.isEtlTracking);
  const regularFields = schemaColumns.filter((c) => !c.isEtlTracking);
  const mappings = (nodeData.fieldMappings as Record<string, string>) || {};

  // Compute mapping summary
  const autoCount = etlTrackingFields.length;
  const mappedCount = regularFields.filter((f) => mappings[f.name] && mappings[f.name].trim() !== '').length;
  const unmappedCount = regularFields.filter((f) => !mappings[f.name] || mappings[f.name].trim() === '').length;
  const requiredUnmappedCount = regularFields.filter(
    (f) => !f.nullable && !f.isEtlTracking && (!mappings[f.name] || mappings[f.name].trim() === '')
  ).length;

  const categoryGroups = schemaColumns.length > 0 ? groupColumnsByCategory(schemaColumns) : [];

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    LOAD_CATEGORIES.forEach((c) => { all[c.id] = true; });
    setExpandedCats(all);
  };

  const collapseAll = () => {
    setExpandedCats({});
  };

  // Count mapped fields per category (non-ETL only)
  const getCategoryMappedCount = (columns: TargetTableColumn[]) => {
    const nonEtl = columns.filter((c) => !c.isEtlTracking);
    const mapped = nonEtl.filter((c) => mappings[c.name] && mappings[c.name].trim() !== '').length;
    return { mapped, total: nonEtl.length };
  };

  return (
    <>
      <div>
        <label className={labelClass}>
          目標表 <span className="text-[#EF4444]">*</span>
        </label>
        <select
          className={selectClass}
          value={targetTable}
          onChange={(e) =>
            onChange({
              targetTable: e.target.value,
              subtitle: e.target.value || undefined,
              fieldMappings: {},
            })
          }
          data-testid="load-target-table-select"
        >
          <option value="">選擇目標表</option>
          {tables.map((t) => (
            <option key={t.tableName} value={t.tableName}>
              {t.displayName} - {t.domain}
            </option>
          ))}
        </select>
        {targetTable && schemaColumns.length > 0 && (
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-gray-400">
              約 {schemaColumns.length} 個欄位（含 {autoCount} 個自動填充）· {LOAD_CATEGORIES.length} 個分類
            </p>
          </div>
        )}
        {loadingSchema && (
          <p className="text-xs text-gray-400 mt-1">載入欄位定義中...</p>
        )}
      </div>

      {/* Write Mode (fullMode toggle) — matching prototype 18-pipeline-editor.html:794-824 */}
      {targetTable && schemaColumns.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">寫入模式</label>
          <div className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-lg bg-gray-50">
            <div className="flex-1 mr-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">全量重寫模式</span>
                <span className="text-xs text-gray-400">(fullMode)</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {(nodeData.fullMode as boolean)
                  ? '將使用 TRUNCATE + INSERT：清空後全量寫入'
                  : '目前使用 UPSERT：新增或更新既有資料'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(nodeData.fullMode)}
              aria-label="全量重寫模式"
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 ${
                (nodeData.fullMode as boolean) ? 'bg-amber-500' : 'bg-gray-300'
              }`}
              onClick={() => onChange({ fullMode: !(nodeData.fullMode as boolean) })}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  (nodeData.fullMode as boolean) ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {(nodeData.fullMode as boolean) && (
            <div className="mt-2 p-3 border border-amber-300 rounded-lg bg-amber-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">注意：執行時將清空目標表所有資料</p>
                  <p className="text-xs text-amber-700 mt-1">開啟後，Pipeline 執行時會先 TRUNCATE 目標表，再全量 INSERT 所有資料。此操作不可復原。</p>
                  <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-white/60 rounded text-xs text-gray-600">
                    <ShieldCheck className="w-3 h-3 text-green-600" />
                    <span>測試執行時不會清空目標表（安全防護）</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping Summary Badges */}
      {targetTable && schemaColumns.length > 0 && (
        <div className="flex items-center gap-3 text-xs">
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 text-green-700"
            data-testid="load-summary-mapped"
          >
            <CheckCircle className="w-3 h-3" />已對應 {mappedCount}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-500"
            data-testid="load-summary-unmapped"
          >
            <MinusCircle className="w-3 h-3" />未對應 {unmappedCount}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-600"
            data-testid="load-summary-required-unmapped"
          >
            <AlertCircle className="w-3 h-3" />必填未對應 {requiredUnmappedCount}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-50 text-gray-400"
            data-testid="load-summary-auto"
          >
            <Lock className="w-3 h-3" />自動 {autoCount}
          </span>
        </div>
      )}

      {/* Field Mapping - Categorized */}
      {targetTable && categoryGroups.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">欄位對應</label>
            <div className="flex gap-1">
              <button onClick={expandAll} className="text-xs text-[#2563EB] hover:underline">全部展開</button>
              <span className="text-xs text-gray-300">|</span>
              <button onClick={collapseAll} className="text-xs text-[#2563EB] hover:underline">全部收合</button>
            </div>
          </div>
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 bg-gray-50 border-b border-[#E5E7EB] text-xs font-medium text-gray-500 px-3 py-2">
              <span>目標欄位</span>
              <span>來源欄位</span>
            </div>

            {categoryGroups.map(({ category, columns }) => {
              const isExpanded = !!expandedCats[category.id];
              const { mapped, total } = getCategoryMappedCount(columns);
              const etlInCat = columns.filter((c) => c.isEtlTracking);
              const hasEtl = etlInCat.length > 0;
              const counterColor = mapped > 0 && mapped === total ? 'text-green-500' : 'text-gray-400';

              // Build counter text
              let counterText = `${mapped}/${total}`;
              if (hasEtl) {
                counterText = `${mapped}+${etlInCat.length}auto`;
              }

              return (
                <div key={category.id} className="border-b border-[#E5E7EB] last:border-b-0" data-testid={`load-category-${category.id}`}>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-xs"
                    data-testid={`load-category-${category.id}-toggle`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded ${category.badgeBg} ${category.badgeText} text-[10px] font-bold`}
                        data-testid={`load-category-badge-${category.id}`}
                      >
                        {category.id}
                      </span>
                      <span className="font-medium text-gray-600">{category.label}</span>
                      <span className="text-gray-400">({columns.length})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={counterColor} data-testid={`load-category-${category.id}-counter`}>{counterText}</span>
                      <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  <div
                    className={isExpanded ? '' : 'hidden'}
                    data-testid={`load-category-${category.id}-content`}
                  >
                    {columns.map((field) => {
                      if (field.isEtlTracking) {
                        return (
                          <div
                            key={field.name}
                            className="grid grid-cols-2 items-center px-3 py-1.5 border-t border-[#E5E7EB] bg-gray-50"
                          >
                            <span className="text-xs text-gray-500">
                              {field.name} <span className="text-gray-400">({field.type})</span>
                            </span>
                            <span className="text-xs text-gray-400 italic flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              系統自動填充
                            </span>
                          </div>
                        );
                      }

                      const isMapped = mappings[field.name] && mappings[field.name].trim() !== '';
                      const isRequired = !field.nullable;

                      return (
                        <div
                          key={field.name}
                          className="grid grid-cols-2 items-center px-3 py-1.5 border-t border-[#E5E7EB] hover:bg-gray-50"
                        >
                          <span className={`text-xs ${isRequired ? 'font-medium' : ''} text-gray-700`}>
                            {isRequired && <span className="text-[#EF4444]">*</span>}{' '}
                            {field.name} <span className="text-gray-400">({field.type})</span>
                          </span>
                          <select
                            className={`text-xs border rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20 ${
                              isMapped ? 'border-green-300 bg-green-50' : 'border-[#E5E7EB]'
                            }`}
                            value={mappings[field.name] || ''}
                            onChange={(e) =>
                              onChange({
                                fieldMappings: { ...mappings, [field.name]: e.target.value },
                              })
                            }
                            data-testid={`load-field-select-${field.name}`}
                          >
                            <option value="">-- 未對應 --</option>
                            {sourceColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// --- 1. Merge Properties ---

interface MergeCondition {
  leftColumn: string;
  rightColumn: string;
  operator: string;
}

function MergeProperties({
  nodeData,
  onChange,
  nodeId,
  nodes,
  edges,
}: SimplePropsBase & { nodeId: string; nodes: Node[]; edges: Edge[] }) {
  const joinType = (nodeData.joinType as string) || 'INNER';
  const conditions = (nodeData.conditions as MergeCondition[]) || [];

  // Derive left/right input from canvas edges connected to this node's handles
  const leftEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'left-input');
  const rightEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'right-input');

  const getNodeLabel = (edgeItem: Edge | undefined) => {
    if (!edgeItem) return null;
    const node = nodes.find((n) => n.id === edgeItem.source);
    if (!node) return null;
    const data = node.data as Record<string, unknown>;
    return (data.label as string) || edgeItem.source;
  };

  const leftLabel = getNodeLabel(leftEdge);
  const rightLabel = getNodeLabel(rightEdge);

  const OPERATORS = ['=', '!=', '>', '<', '>=', '<='];

  const addCondition = () => {
    onChange({
      conditions: [...conditions, { leftColumn: '', rightColumn: '', operator: '=' }],
    });
  };

  const removeCondition = (index: number) => {
    onChange({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<MergeCondition>) => {
    const newConditions = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ conditions: newConditions });
  };

  return (
    <>
      <div>
        <label className={labelClass}>JOIN 類型</label>
        <select
          className={selectClass}
          value={joinType}
          onChange={(e) => onChange({ joinType: e.target.value, subtitle: e.target.value })}
          data-testid="merge-join-type-select"
        >
          <option value="INNER">INNER JOIN</option>
          <option value="LEFT">LEFT JOIN</option>
          <option value="RIGHT">RIGHT JOIN</option>
          <option value="FULL">FULL JOIN</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>左輸入來源</label>
        {leftLabel ? (
          <div className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 border border-[#E5E7EB] rounded-lg text-gray-700" data-testid="merge-left-input">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            {leftLabel}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic px-3 py-2 border border-dashed border-[#E5E7EB] rounded-lg" data-testid="merge-left-input">
            請從畫布連接上方端口（Left）
          </p>
        )}
      </div>
      <div>
        <label className={labelClass}>右輸入來源</label>
        {rightLabel ? (
          <div className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 border border-[#E5E7EB] rounded-lg text-gray-700" data-testid="merge-right-input">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            {rightLabel}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic px-3 py-2 border border-dashed border-[#E5E7EB] rounded-lg" data-testid="merge-right-input">
            請從畫布連接下方端口（Right）
          </p>
        )}
      </div>
      <div className="text-xs font-medium text-gray-500 mb-2">合併條件</div>
      {conditions.map((cond, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="條件" onRemove={() => removeCondition(index)} />
          <div>
            <label className={smallLabelClass}>左欄位{leftLabel && ` (${leftLabel})`}</label>
            <input
              type="text"
              className={smallInputClass}
              value={cond.leftColumn}
              onChange={(e) => updateCondition(index, { leftColumn: e.target.value })}
              data-testid={`merge-condition-${index}-left`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>運算子</label>
            <select
              className={smallInputClass}
              value={cond.operator}
              onChange={(e) => updateCondition(index, { operator: e.target.value })}
              data-testid={`merge-condition-${index}-operator`}
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={smallLabelClass}>右欄位{rightLabel && ` (${rightLabel})`}</label>
            <input
              type="text"
              className={smallInputClass}
              value={cond.rightColumn}
              onChange={(e) => updateCondition(index, { rightColumn: e.target.value })}
              data-testid={`merge-condition-${index}-right`}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={addCondition} label="新增條件" />
    </>
  );
}

// --- 2. Field Mapping Properties ---

interface FieldMappingItem {
  sourceColumn: string;
  targetColumn: string;
  defaultValue: string | null;
}

function FieldMappingProperties({ nodeData, onChange }: SimplePropsBase) {
  const mappings = (nodeData.mappings as FieldMappingItem[]) || [];
  const dropUnmapped = (nodeData.dropUnmapped as boolean) || false;

  const addMapping = () => {
    onChange({
      mappings: [...mappings, { sourceColumn: '', targetColumn: '', defaultValue: null }],
    });
  };

  const removeMapping = (index: number) => {
    onChange({ mappings: mappings.filter((_, i) => i !== index) });
  };

  const updateMapping = (index: number, updates: Partial<FieldMappingItem>) => {
    const newMappings = mappings.map((m, i) => (i === index ? { ...m, ...updates } : m));
    onChange({ mappings: newMappings, subtitle: `${newMappings.length} 組對應` });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">欄位對應表</div>
      {mappings.map((mapping, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="對應" onRemove={() => removeMapping(index)} />
          <div>
            <label className={smallLabelClass}>來源欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={mapping.sourceColumn}
              onChange={(e) => updateMapping(index, { sourceColumn: e.target.value })}
              data-testid={`field-mapping-${index}-source`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>目標欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={mapping.targetColumn}
              onChange={(e) => updateMapping(index, { targetColumn: e.target.value })}
              data-testid={`field-mapping-${index}-target`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>預設值</label>
            <input
              type="text"
              className={smallInputClass}
              value={mapping.defaultValue || ''}
              onChange={(e) => updateMapping(index, { defaultValue: e.target.value || null })}
              placeholder="(無)"
              data-testid={`field-mapping-${index}-default`}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={addMapping} label="新增對應" />
      <div className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          checked={dropUnmapped}
          onChange={(e) => onChange({ dropUnmapped: e.target.checked })}
          data-testid="field-mapping-drop-unmapped"
          className="rounded border-gray-300"
        />
        <label className="text-sm text-gray-700">丟棄未對應欄位 (dropUnmapped)</label>
      </div>
    </>
  );
}

// --- 3. Conditional Properties ---

interface ConditionalRuleCondition {
  when: string;
  then: string;
}

interface ConditionalRule {
  targetColumn: string;
  conditions: ConditionalRuleCondition[];
  elseValue: string;
}

function ConditionalProperties({ nodeData, onChange }: SimplePropsBase) {
  const rules = (nodeData.rules as ConditionalRule[]) || [];

  const addRule = () => {
    const newRules = [...rules, { targetColumn: '', conditions: [{ when: '', then: '' }], elseValue: '' }];
    onChange({ rules: newRules, subtitle: `${newRules.length} 條規則` });
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    onChange({ rules: newRules, subtitle: newRules.length ? `${newRules.length} 條規則` : undefined });
  };

  const updateRule = (index: number, updates: Partial<ConditionalRule>) => {
    const newRules = rules.map((r, i) => (i === index ? { ...r, ...updates } : r));
    onChange({ rules: newRules });
  };

  const addCondition = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { conditions: [...rule.conditions, { when: '', then: '' }] });
  };

  const removeCondition = (ruleIndex: number, condIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { conditions: rule.conditions.filter((_, i) => i !== condIndex) });
  };

  const updateCondition = (ruleIndex: number, condIndex: number, updates: Partial<ConditionalRuleCondition>) => {
    const rule = rules[ruleIndex];
    const newConditions = rule.conditions.map((c, i) => (i === condIndex ? { ...c, ...updates } : c));
    updateRule(ruleIndex, { conditions: newConditions });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">規則列表</div>
      {rules.map((rule, ruleIndex) => (
        <div key={ruleIndex} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={ruleIndex} label="規則" onRemove={() => removeRule(ruleIndex)} />
          <div>
            <label className={smallLabelClass}>目標欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={rule.targetColumn}
              onChange={(e) => updateRule(ruleIndex, { targetColumn: e.target.value })}
              data-testid={`conditional-rule-${ruleIndex}-target`}
            />
          </div>
          <div className="text-xs font-medium text-gray-400 mb-1 ml-1">條件</div>
          {rule.conditions.map((cond, condIndex) => (
            <div key={condIndex} className="ml-2 border-l-2 border-[#E5E7EB] pl-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">IF #{condIndex + 1}</span>
                {rule.conditions.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => removeCondition(ruleIndex, condIndex)}
                  >
                    移除
                  </button>
                )}
              </div>
              <div>
                <label className={smallLabelClass}>WHEN 條件式</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={cond.when}
                  onChange={(e) => updateCondition(ruleIndex, condIndex, { when: e.target.value })}
                  placeholder="left.col >= right.col"
                  data-testid={`conditional-rule-${ruleIndex}-cond-${condIndex}-when`}
                />
              </div>
              <div>
                <label className={smallLabelClass}>THEN 值</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={cond.then}
                  onChange={(e) => updateCondition(ruleIndex, condIndex, { then: e.target.value })}
                  placeholder="left.col"
                  data-testid={`conditional-rule-${ruleIndex}-cond-${condIndex}-then`}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="ml-2 text-xs text-[#2563EB] hover:underline"
            onClick={() => addCondition(ruleIndex)}
          >
            + 新增條件
          </button>
          <div>
            <label className={smallLabelClass}>ELSE 預設值</label>
            <input
              type="text"
              className={smallInputClass}
              value={rule.elseValue}
              onChange={(e) => updateRule(ruleIndex, { elseValue: e.target.value })}
              placeholder="right.col"
              data-testid={`conditional-rule-${ruleIndex}-else`}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={addRule} label="新增規則" />
    </>
  );
}

// --- 4. Filter Properties ---

interface FilterCondition {
  column: string;
  operator: string;
  value: string | null;
}

function FilterProperties({ nodeData, onChange }: SimplePropsBase) {
  const logic = (nodeData.logic as string) || 'AND';
  const conditions = (nodeData.conditions as FilterCondition[]) || [];

  const OPERATORS = [
    '=', '!=', '>', '<', '>=', '<=',
    'IS_NULL', 'IS_NOT_NULL', 'IN', 'NOT_IN',
    'CONTAINS', 'STARTS_WITH', 'ENDS_WITH',
  ];

  const addCondition = () => {
    onChange({
      conditions: [...conditions, { column: '', operator: '=', value: '' }],
    });
  };

  const removeCondition = (index: number) => {
    onChange({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ conditions: newConditions });
  };

  const needsValue = (op: string) => !['IS_NULL', 'IS_NOT_NULL'].includes(op);

  return (
    <>
      <div>
        <label className={labelClass}>邏輯運算子</label>
        <select
          className={selectClass}
          value={logic}
          onChange={(e) => onChange({ logic: e.target.value, subtitle: e.target.value })}
          data-testid="filter-logic-select"
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      </div>
      <div className="text-xs font-medium text-gray-500 mb-2">篩選條件</div>
      {conditions.map((cond, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="條件" onRemove={() => removeCondition(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={cond.column}
              onChange={(e) => updateCondition(index, { column: e.target.value })}
              data-testid={`filter-condition-${index}-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>運算子</label>
            <select
              className={smallInputClass}
              value={cond.operator}
              onChange={(e) => updateCondition(index, { operator: e.target.value })}
              data-testid={`filter-condition-${index}-operator`}
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
          {needsValue(cond.operator) && (
            <div>
              <label className={smallLabelClass}>值</label>
              <input
                type="text"
                className={smallInputClass}
                value={cond.value || ''}
                onChange={(e) => updateCondition(index, { value: e.target.value || null })}
                data-testid={`filter-condition-${index}-value`}
              />
            </div>
          )}
        </div>
      ))}
      <AddButton onClick={addCondition} label="新增條件" />
    </>
  );
}

// --- 5. Dedup Properties ---

function DedupProperties({ nodeData, onChange }: SimplePropsBase) {
  const keyColumns = (nodeData.keyColumns as string[]) || [];
  const keepStrategy = (nodeData.keepStrategy as string) || 'first';
  const timestampColumn = (nodeData.timestampColumn as string) || '';

  return (
    <>
      <div>
        <label className={labelClass}>去重依據欄位</label>
        <TagInput
          tags={keyColumns}
          onAdd={(tag) => {
            const newCols = [...keyColumns, tag];
            onChange({ keyColumns: newCols, subtitle: `${newCols.length} 欄位` });
          }}
          onRemove={(tag) => {
            const newCols = keyColumns.filter((c) => c !== tag);
            onChange({ keyColumns: newCols, subtitle: newCols.length ? `${newCols.length} 欄位` : undefined });
          }}
          placeholder="輸入欄位名稱..."
          testId="dedup-key-column-input"
        />
      </div>
      <div>
        <label className={labelClass}>保留策略</label>
        <select
          className={selectClass}
          value={keepStrategy}
          onChange={(e) => onChange({ keepStrategy: e.target.value, subtitle: `keep: ${e.target.value}` })}
          data-testid="dedup-keep-strategy-select"
        >
          <option value="first">保留第一筆 (first)</option>
          <option value="last">保留最後一筆 (last)</option>
          <option value="latest_timestamp">依時間戳記 (latest_timestamp)</option>
        </select>
      </div>
      {keepStrategy === 'latest_timestamp' && (
        <div>
          <label className={labelClass}>時間戳記欄位</label>
          <input
            type="text"
            className={inputClass}
            value={timestampColumn}
            onChange={(e) => onChange({ timestampColumn: e.target.value })}
            placeholder="輸入時間戳記欄位名稱"
            data-testid="dedup-timestamp-column"
          />
        </div>
      )}
    </>
  );
}

// --- 6. Lookup Properties ---

interface LookupOutputColumn {
  lookupColumn: string;
  outputAlias: string;
}

function LookupProperties({
  nodeData,
  rawTables,
  onChange,
  nodeId,
  nodes,
  edges,
}: SimplePropsBase & { rawTables: RawTableItem[]; nodeId: string; nodes: Node[]; edges: Edge[] }) {
  const lookupSource = (nodeData.lookupSource as string) || '';
  const lookupFilter = (nodeData.lookupFilter as string) || '';
  const matchColumn = (nodeData.matchColumn as string) || '';
  const lookupMatchColumn = (nodeData.lookupMatchColumn as string) || '';
  const outputColumns = (nodeData.outputColumns as LookupOutputColumn[]) || [];
  const noMatchStrategy = (nodeData.noMatchStrategy as string) || 'null';
  const defaultValue = (nodeData.defaultValue as string) || '';

  // Detect if a lookup-input edge is connected
  const lookupEdge = edges.find((e) => e.target === nodeId && e.targetHandle === 'lookup-input');
  const hasLookupInput = !!lookupEdge;

  const getLookupSourceLabel = () => {
    if (!lookupEdge) return null;
    const node = nodes.find((n) => n.id === lookupEdge.source);
    if (!node) return null;
    const data = node.data as Record<string, unknown>;
    return (data.label as string) || lookupEdge.source;
  };

  const lookupSourceLabel = getLookupSourceLabel();

  // Auto-sync subtitle with lookup source node label in dual-input mode
  useEffect(() => {
    if (hasLookupInput && lookupSourceLabel) {
      onChange({ subtitle: lookupSourceLabel });
    } else if (!hasLookupInput) {
      const selected = rawTables.find((t) => t.rawTableName === lookupSource);
      onChange({ subtitle: selected?.taskName || lookupSource || undefined });
    }
  }, [hasLookupInput, lookupSourceLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const addOutputColumn = () => {
    onChange({
      outputColumns: [...outputColumns, { lookupColumn: '', outputAlias: '' }],
    });
  };

  const removeOutputColumn = (index: number) => {
    onChange({ outputColumns: outputColumns.filter((_, i) => i !== index) });
  };

  const updateOutputColumn = (index: number, updates: Partial<LookupOutputColumn>) => {
    const newCols = outputColumns.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ outputColumns: newCols });
  };

  return (
    <>
      {hasLookupInput ? (
        <div>
          <label className={labelClass}>對照來源</label>
          <div className="text-sm text-gray-700 bg-gray-50 border border-[#E5E7EB] rounded-lg px-3 py-2" data-testid="lookup-source-connected">
            {lookupSourceLabel || '上游節點'}
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={labelClass}>對照來源</label>
            <select
              className={selectClass}
              value={lookupSource}
              onChange={(e) => {
                const selected = rawTables.find((t) => t.rawTableName === e.target.value);
                onChange({
                  lookupSource: e.target.value,
                  subtitle: selected?.taskName || undefined,
                });
              }}
              data-testid="lookup-source-input"
            >
              <option value="">選擇對照表</option>
              {rawTables.map((t) => (
                <option key={t.rawTableName} value={t.rawTableName}>
                  {t.rawTableName}（{t.taskName}）
                </option>
              ))}
            </select>
            {(() => {
              const selectedInfo = rawTables.find((t) => t.rawTableName === lookupSource);
              return selectedInfo ? (
                <>
                  <p className="text-xs text-gray-400 mt-1">
                    來源：{selectedInfo.datasourceName} / {selectedInfo.sourceTable}
                  </p>
                  {selectedInfo.lastExecutionAt && (
                    <p className="text-xs text-gray-400">
                      最後擷取：{new Date(selectedInfo.lastExecutionAt).toLocaleString('zh-TW')}
                    </p>
                  )}
                </>
              ) : null;
            })()}
          </div>
          <div>
            <label className={labelClass}>過濾條件</label>
            <input
              type="text"
              className={inputClass}
              value={lookupFilter}
              onChange={(e) => onChange({ lookupFilter: e.target.value })}
              placeholder="例: TBL_ID = 'A2'"
              data-testid="lookup-filter-input"
            />
          </div>
          <p className="text-xs text-blue-500 mt-1">提示：可將 Filter 節點連接至 lookup-input 端口以取代手動設定</p>
        </>
      )}
      <div>
        <label className={labelClass}>比對欄位（主表）</label>
        <input
          type="text"
          className={inputClass}
          value={matchColumn}
          onChange={(e) => onChange({ matchColumn: e.target.value })}
          placeholder="主表的比對欄位"
          data-testid="lookup-match-column"
        />
      </div>
      <div>
        <label className={labelClass}>比對欄位（對照表）</label>
        <input
          type="text"
          className={inputClass}
          value={lookupMatchColumn}
          onChange={(e) => onChange({ lookupMatchColumn: e.target.value })}
          placeholder="對照表的比對欄位"
          data-testid="lookup-lookup-match-column"
        />
      </div>
      <div className="text-xs font-medium text-gray-500 mb-2">輸出欄位</div>
      {outputColumns.map((col, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="輸出" onRemove={() => removeOutputColumn(index)} />
          <div>
            <label className={smallLabelClass}>對照表欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={col.lookupColumn}
              onChange={(e) => updateOutputColumn(index, { lookupColumn: e.target.value })}
              data-testid={`lookup-output-${index}-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>輸出別名</label>
            <input
              type="text"
              className={smallInputClass}
              value={col.outputAlias}
              onChange={(e) => updateOutputColumn(index, { outputAlias: e.target.value })}
              data-testid={`lookup-output-${index}-alias`}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={addOutputColumn} label="新增輸出欄位" />
      <div>
        <label className={labelClass}>無匹配策略</label>
        <select
          className={selectClass}
          value={noMatchStrategy}
          onChange={(e) => onChange({ noMatchStrategy: e.target.value })}
          data-testid="lookup-no-match-strategy"
        >
          <option value="null">填入 NULL</option>
          <option value="default_value">預設值</option>
          <option value="skip_row">跳過該列</option>
        </select>
      </div>
      {noMatchStrategy === 'default_value' && (
        <div>
          <label className={labelClass}>預設值</label>
          <input
            type="text"
            className={inputClass}
            value={defaultValue}
            onChange={(e) => onChange({ defaultValue: e.target.value || null })}
            data-testid="lookup-default-value"
          />
        </div>
      )}
    </>
  );
}

// --- 7. String Process Properties ---

interface StringOperation {
  column: string;
  operation: string;
  params: Record<string, unknown>;
}

function StringProcessProperties({ nodeData, onChange }: SimplePropsBase) {
  const operations = (nodeData.operations as StringOperation[]) || [];

  const OPERATIONS = [
    'trim', 'upper', 'lower', 'substring', 'concat', 'regex_replace', 'normalize',
  ];

  const addOperation = () => {
    onChange({
      operations: [...operations, { column: '', operation: 'trim', params: {} }],
      subtitle: `${operations.length + 1} 組操作`,
    });
  };

  const removeOperation = (index: number) => {
    const newOps = operations.filter((_, i) => i !== index);
    onChange({ operations: newOps, subtitle: newOps.length ? `${newOps.length} 組操作` : undefined });
  };

  const updateOperation = (index: number, updates: Partial<StringOperation>) => {
    const newOps = operations.map((o, i) => (i === index ? { ...o, ...updates } : o));
    onChange({ operations: newOps });
  };

  const updateParams = (index: number, paramUpdates: Record<string, unknown>) => {
    const newOps = operations.map((o, i) =>
      i === index ? { ...o, params: { ...o.params, ...paramUpdates } } : o,
    );
    onChange({ operations: newOps });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">字串操作列表</div>
      {operations.map((op, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="操作" onRemove={() => removeOperation(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={op.column}
              onChange={(e) => updateOperation(index, { column: e.target.value })}
              data-testid={`string-op-${index}-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>操作類型</label>
            <select
              className={smallInputClass}
              value={op.operation}
              onChange={(e) => updateOperation(index, { operation: e.target.value, params: {} })}
              data-testid={`string-op-${index}-type`}
            >
              {OPERATIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          {/* Dynamic params based on operation type */}
          {op.operation === 'substring' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={smallLabelClass}>起始位置</label>
                <input
                  type="number"
                  className={smallInputClass}
                  value={(op.params.start as number) ?? 0}
                  onChange={(e) => updateParams(index, { start: parseInt(e.target.value) || 0 })}
                  data-testid={`string-op-${index}-start`}
                />
              </div>
              <div>
                <label className={smallLabelClass}>長度</label>
                <input
                  type="number"
                  className={smallInputClass}
                  value={(op.params.length as number) ?? 10}
                  onChange={(e) => updateParams(index, { length: parseInt(e.target.value) || 0 })}
                  data-testid={`string-op-${index}-length`}
                />
              </div>
            </div>
          )}
          {op.operation === 'concat' && (
            <>
              <div>
                <label className={smallLabelClass}>連接字元</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={(op.params.concatWith as string) || ''}
                  onChange={(e) => updateParams(index, { concatWith: e.target.value })}
                  data-testid={`string-op-${index}-concat-with`}
                />
              </div>
              <div>
                <label className={smallLabelClass}>連接欄位（逗號分隔）</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={((op.params.concatColumns as string[]) || []).join(', ')}
                  onChange={(e) =>
                    updateParams(index, {
                      concatColumns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="col_a, col_b"
                  data-testid={`string-op-${index}-concat-columns`}
                />
              </div>
            </>
          )}
          {op.operation === 'regex_replace' && (
            <>
              <div>
                <label className={smallLabelClass}>正則表達式</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={(op.params.pattern as string) || ''}
                  onChange={(e) => updateParams(index, { pattern: e.target.value })}
                  data-testid={`string-op-${index}-pattern`}
                />
              </div>
              <div>
                <label className={smallLabelClass}>替換值</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={(op.params.replacement as string) || ''}
                  onChange={(e) => updateParams(index, { replacement: e.target.value })}
                  data-testid={`string-op-${index}-replacement`}
                />
              </div>
            </>
          )}
        </div>
      ))}
      <AddButton onClick={addOperation} label="新增操作" />
    </>
  );
}

// --- 8. Encrypt/Masking Properties ---

interface EncryptRule {
  column: string;
  method: string;
  maskPattern: string | null;
  visibleStart: number;
  visibleEnd: number;
}

function EncryptProperties({ nodeData, onChange }: SimplePropsBase) {
  const rules = (nodeData.rules as EncryptRule[]) || [];

  const addRule = () => {
    onChange({
      rules: [...rules, { column: '', method: 'partial_mask', maskPattern: null, visibleStart: 0, visibleEnd: 0 }],
      subtitle: `${rules.length + 1} 組規則`,
    });
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    onChange({ rules: newRules, subtitle: newRules.length ? `${newRules.length} 組規則` : undefined });
  };

  const updateRule = (index: number, updates: Partial<EncryptRule>) => {
    const newRules = rules.map((r, i) => (i === index ? { ...r, ...updates } : r));
    onChange({ rules: newRules });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">加密/脫敏規則</div>
      {rules.map((rule, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="規則" onRemove={() => removeRule(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={rule.column}
              onChange={(e) => updateRule(index, { column: e.target.value })}
              data-testid={`encrypt-rule-${index}-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>方法</label>
            <select
              className={smallInputClass}
              value={rule.method}
              onChange={(e) => updateRule(index, { method: e.target.value })}
              data-testid={`encrypt-rule-${index}-method`}
            >
              <option value="aes_encrypt">AES 加密</option>
              <option value="partial_mask">部分遮罩</option>
            </select>
          </div>
          {rule.method === 'partial_mask' && (
            <>
              <div>
                <label className={smallLabelClass}>遮罩模式</label>
                <input
                  type="text"
                  className={smallInputClass}
                  value={rule.maskPattern || ''}
                  onChange={(e) => updateRule(index, { maskPattern: e.target.value || null })}
                  placeholder="例：***"
                  data-testid={`encrypt-rule-${index}-pattern`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={smallLabelClass}>可見起始位置</label>
                  <input
                    type="number"
                    className={smallInputClass}
                    value={rule.visibleStart}
                    onChange={(e) => updateRule(index, { visibleStart: parseInt(e.target.value) || 0 })}
                    data-testid={`encrypt-rule-${index}-visible-start`}
                  />
                </div>
                <div>
                  <label className={smallLabelClass}>可見結束位置</label>
                  <input
                    type="number"
                    className={smallInputClass}
                    value={rule.visibleEnd}
                    onChange={(e) => updateRule(index, { visibleEnd: parseInt(e.target.value) || 0 })}
                    data-testid={`encrypt-rule-${index}-visible-end`}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ))}
      <AddButton onClick={addRule} label="新增規則" />
    </>
  );
}

// --- 9. Aggregate Properties ---

interface AggregationItem {
  column: string;
  function: string;
  outputAlias: string;
}

function AggregateProperties({ nodeData, onChange }: SimplePropsBase) {
  const groupByColumns = (nodeData.groupByColumns as string[]) || [];
  const aggregations = (nodeData.aggregations as AggregationItem[]) || [];

  const AGG_FUNCTIONS = ['SUM', 'COUNT', 'AVG', 'MAX', 'MIN'];

  const addAggregation = () => {
    onChange({
      aggregations: [...aggregations, { column: '', function: 'COUNT', outputAlias: '' }],
      subtitle: `${aggregations.length + 1} 組聚合`,
    });
  };

  const removeAggregation = (index: number) => {
    const newAggs = aggregations.filter((_, i) => i !== index);
    onChange({ aggregations: newAggs, subtitle: newAggs.length ? `${newAggs.length} 組聚合` : undefined });
  };

  const updateAggregation = (index: number, updates: Partial<AggregationItem>) => {
    const newAggs = aggregations.map((a, i) => (i === index ? { ...a, ...updates } : a));
    onChange({ aggregations: newAggs });
  };

  return (
    <>
      <div>
        <label className={labelClass}>GROUP BY 欄位</label>
        <TagInput
          tags={groupByColumns}
          onAdd={(tag) => onChange({ groupByColumns: [...groupByColumns, tag] })}
          onRemove={(tag) => onChange({ groupByColumns: groupByColumns.filter((c) => c !== tag) })}
          placeholder="輸入欄位名稱..."
          testId="aggregate-group-by-input"
        />
      </div>
      <div className="text-xs font-medium text-gray-500 mb-2">聚合函數</div>
      {aggregations.map((agg, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="聚合" onRemove={() => removeAggregation(index)} />
          <div>
            <label className={smallLabelClass}>欄位</label>
            <input
              type="text"
              className={smallInputClass}
              value={agg.column}
              onChange={(e) => updateAggregation(index, { column: e.target.value })}
              data-testid={`aggregate-${index}-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>函數</label>
            <select
              className={smallInputClass}
              value={agg.function}
              onChange={(e) => updateAggregation(index, { function: e.target.value })}
              data-testid={`aggregate-${index}-function`}
            >
              {AGG_FUNCTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={smallLabelClass}>輸出別名</label>
            <input
              type="text"
              className={smallInputClass}
              value={agg.outputAlias}
              onChange={(e) => updateAggregation(index, { outputAlias: e.target.value })}
              data-testid={`aggregate-${index}-alias`}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={addAggregation} label="新增聚合" />
    </>
  );
}

// --- 10. Derived Field Properties ---

interface DerivationItem {
  outputColumn: string;
  expression: string;
  outputType: string;
}

function DerivedFieldProperties({ nodeData, onChange }: SimplePropsBase) {
  const derivations = (nodeData.expressions as DerivationItem[]) || [];

  const TYPE_OPTIONS = ['VARCHAR', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP'];

  const addDerivation = () => {
    onChange({
      expressions: [...derivations, { outputColumn: '', expression: '', outputType: 'VARCHAR' }],
      subtitle: `${derivations.length + 1} 組衍生欄位`,
    });
  };

  const removeDerivation = (index: number) => {
    const newDerivations = derivations.filter((_, i) => i !== index);
    onChange({
      expressions: newDerivations,
      subtitle: newDerivations.length ? `${newDerivations.length} 組衍生欄位` : undefined,
    });
  };

  const updateDerivation = (index: number, updates: Partial<DerivationItem>) => {
    const newDerivations = derivations.map((d, i) => (i === index ? { ...d, ...updates } : d));
    onChange({ expressions: newDerivations });
  };

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">衍生欄位列表</div>
      {derivations.map((deriv, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <ItemHeader index={index} label="欄位" onRemove={() => removeDerivation(index)} />
          <div>
            <label className={smallLabelClass}>新欄位名稱</label>
            <input
              type="text"
              className={smallInputClass}
              value={deriv.outputColumn}
              onChange={(e) => updateDerivation(index, { outputColumn: e.target.value })}
              data-testid={`derived-${index}-output-column`}
            />
          </div>
          <div>
            <label className={smallLabelClass}>運算式</label>
            <input
              type="text"
              className={smallInputClass}
              value={deriv.expression}
              onChange={(e) => updateDerivation(index, { expression: e.target.value })}
              placeholder="{column_a} + {column_b}"
              data-testid={`derived-${index}-expression`}
            />
            <p className="text-xs text-gray-400 mt-1">
              使用 {'{'}column_name{'}'} 語法引用欄位
            </p>
          </div>
          <div>
            <label className={smallLabelClass}>輸出型別</label>
            <select
              className={smallInputClass}
              value={deriv.outputType}
              onChange={(e) => updateDerivation(index, { outputType: e.target.value })}
              data-testid={`derived-${index}-output-type`}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <AddButton onClick={addDerivation} label="新增衍生欄位" />
    </>
  );
}

// --- Generic Fallback ---

function GenericTransformProperties({ nodeData, onChange }: SimplePropsBase) {
  const description = (nodeData.description as string) || '';

  return (
    <div>
      <label className={labelClass}>描述</label>
      <textarea
        className={inputClass}
        rows={3}
        value={description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="輸入此節點的處理說明..."
      />
    </div>
  );
}
