import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { MousePointerClick, Trash2, Plus, Lock } from 'lucide-react';
import { getNodeDef, getCategoryColor, getCategoryLabel } from './node-types';
import type { RawTableItem } from '@cdmp/shared';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  rawTables: RawTableItem[];
  onNodeDataChange: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function PropertiesPanel({
  selectedNode,
  rawTables,
  onNodeDataChange,
  onDeleteNode,
}: PropertiesPanelProps) {
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
    onNodeDataChange(selectedNode.id, { ...nodeData, ...updates });
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
            <span className="text-sm font-semibold text-gray-800">
              {(nodeData.label as string) || nodeDef.label}
            </span>
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

      {/* Properties Form */}
      <div className="p-4 space-y-4">
        {nodeType === 'raw_data_extract' && (
          <ExtractProperties
            nodeData={nodeData}
            rawTables={rawTables}
            onChange={updateData}
          />
        )}
        {nodeType === 'null_handler' && (
          <NullHandlerProperties nodeData={nodeData} onChange={updateData} />
        )}
        {nodeType === 'format_convert' && (
          <FormatProperties nodeData={nodeData} onChange={updateData} />
        )}
        {nodeType === 'type_cast' && (
          <TypeCastProperties nodeData={nodeData} onChange={updateData} />
        )}
        {nodeType === 'target_load' && (
          <LoadProperties nodeData={nodeData} onChange={updateData} />
        )}
        {/* Generic properties for other transform types */}
        {nodeDef.category === 'transform' &&
          !['null_handler', 'format_convert', 'type_cast'].includes(nodeType) && (
            <GenericTransformProperties nodeData={nodeData} onChange={updateData} />
          )}
      </div>
    </aside>
  );
}

// --- Sub-components for each node type ---

const inputClass =
  'w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]';
const selectClass = inputClass;
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

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

function NullHandlerProperties({
  nodeData,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
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

interface FormatRule {
  field: string;
  formatType: string;
  sourceFormat: string;
  targetFormat: string;
}

function FormatProperties({
  nodeData,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
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
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">規則 {index + 1}</span>
            <button
              onClick={() => removeRule(index)}
              className="text-gray-400 hover:text-[#EF4444]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">欄位</label>
            <input
              type="text"
              className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              value={rule.field}
              onChange={(e) => updateRule(index, { field: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">格式類型</label>
            <select
              className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
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
              <label className="block text-xs text-gray-500 mb-1">來源格式</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                value={rule.sourceFormat}
                onChange={(e) => updateRule(index, { sourceFormat: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">目標格式</label>
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
      <button
        onClick={addRule}
        className="w-full py-2 text-sm text-[#2563EB] border border-dashed border-[#2563EB] rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" />
        新增規則
      </button>
    </>
  );
}

interface TypeCastItem {
  field: string;
  sourceType: string;
  targetType: string;
}

function TypeCastProperties({
  nodeData,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const casts = (nodeData.casts as TypeCastItem[]) || [];

  const addCast = () => {
    onChange({
      casts: [...casts, { field: '', sourceType: 'VARCHAR', targetType: 'VARCHAR' }],
    });
  };

  const removeCast = (index: number) => {
    onChange({ casts: casts.filter((_, i) => i !== index) });
  };

  const updateCast = (index: number, updates: Partial<TypeCastItem>) => {
    const newCasts = casts.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange({ casts: newCasts });
  };

  const TYPE_OPTIONS = [
    'VARCHAR',
    'INTEGER',
    'DECIMAL',
    'BOOLEAN',
    'DATE',
    'TIMESTAMP',
    'TEXT',
    'UUID',
  ];

  return (
    <>
      <div className="text-xs font-medium text-gray-500 mb-2">轉換清單</div>
      {casts.map((cast, index) => (
        <div key={index} className="border border-[#E5E7EB] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">項目 {index + 1}</span>
            <button
              onClick={() => removeCast(index)}
              className="text-gray-400 hover:text-[#EF4444]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">欄位</label>
            <input
              type="text"
              className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              value={cast.field}
              onChange={(e) => updateCast(index, { field: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">來源型別</label>
              <input
                type="text"
                value={cast.sourceType}
                disabled
                className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">目標型別</label>
              <select
                className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                value={cast.targetType}
                onChange={(e) => updateCast(index, { targetType: e.target.value })}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={addCast}
        className="w-full py-2 text-sm text-[#2563EB] border border-dashed border-[#2563EB] rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" />
        新增轉換
      </button>
    </>
  );
}

function LoadProperties({
  nodeData,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const targetTable = (nodeData.targetTable as string) || '';

  const TARGET_TABLES = [
    { value: 'customer_core', label: 'Customer Core（身分/主檔）- core' },
    { value: 'customer_interaction', label: 'Customer Interaction（行為/接觸）- interaction' },
    { value: 'customer_financial', label: 'Customer Financial（交易/風控）- financial' },
    { value: 'customer_service', label: 'Customer Service（客服/申訴）- service' },
  ];

  // Mock field mappings
  const FIELD_MAPPINGS: Record<string, { name: string; type: string; required?: boolean }[]> = {
    customer_core: [
      { name: 'customer_id', type: 'UUID', required: true },
      { name: 'id_number', type: 'VARCHAR' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'gender', type: 'VARCHAR' },
      { name: 'date_of_birth', type: 'DATE' },
      { name: 'phone', type: 'VARCHAR' },
      { name: 'email', type: 'VARCHAR' },
      { name: 'address', type: 'TEXT' },
      { name: 'occupation', type: 'VARCHAR' },
      { name: 'company_name', type: 'VARCHAR' },
      { name: 'customer_type', type: 'VARCHAR' },
      { name: 'registration_date', type: 'TIMESTAMP' },
      { name: 'last_updated_at', type: 'TIMESTAMP' },
    ],
  };

  const ETL_TRACKING_FIELDS = [
    { name: 'data_source', type: 'VARCHAR' },
    { name: '_etl_loaded_at', type: 'TIMESTAMP' },
    { name: '_etl_pipeline_id', type: 'UUID' },
  ];

  const fields = targetTable ? FIELD_MAPPINGS[targetTable] || [] : [];
  const mappings = (nodeData.fieldMappings as Record<string, string>) || {};

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
          {TARGET_TABLES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {targetTable && (
          <>
            <p className="text-xs text-gray-400 mt-1">
              {fields.length + ETL_TRACKING_FIELDS.length} 個欄位（含{' '}
              {ETL_TRACKING_FIELDS.length} 個 ETL 追蹤欄位）
            </p>
          </>
        )}
      </div>

      {targetTable && fields.length > 0 && (
        <div>
          <label className={labelClass}>欄位對應</label>
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 bg-gray-50 border-b border-[#E5E7EB] text-xs font-medium text-gray-500 px-3 py-2">
              <span>目標欄位</span>
              <span>來源欄位</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {fields.map((field) => (
                <div
                  key={field.name}
                  className="grid grid-cols-2 items-center px-3 py-2 border-b border-[#E5E7EB] hover:bg-gray-50"
                >
                  <span className="text-xs font-medium text-gray-700">
                    {field.required && <span className="text-[#EF4444]">*</span>}{' '}
                    {field.name} <span className="text-gray-400">({field.type})</span>
                  </span>
                  <input
                    type="text"
                    className="text-xs border border-[#E5E7EB] rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                    value={mappings[field.name] || ''}
                    onChange={(e) =>
                      onChange({
                        fieldMappings: { ...mappings, [field.name]: e.target.value },
                      })
                    }
                    placeholder="-- 不對應 --"
                  />
                </div>
              ))}
              {ETL_TRACKING_FIELDS.map((field) => (
                <div
                  key={field.name}
                  className="grid grid-cols-2 items-center px-3 py-2 border-b border-[#E5E7EB] bg-gray-50"
                >
                  <span className="text-xs text-gray-500">
                    {field.name} <span className="text-gray-400">({field.type})</span>
                  </span>
                  <span className="text-xs text-gray-400 italic flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    系統自動填充
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GenericTransformProperties({
  nodeData,
  onChange,
}: {
  nodeData: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
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
