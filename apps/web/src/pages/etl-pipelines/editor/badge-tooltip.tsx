import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { Node, Edge } from '@xyflow/react';
import { buildTooltipContent, type BadgeTooltipContent } from './node-field-stats';

// ─── Global Tooltip Manager Context ───────────────────────────

interface TooltipManagerContextValue {
  activeNodeId: string | null;
  show: (nodeId: string, anchorEl: HTMLElement) => void;
  hide: () => void;
}

const TooltipManagerContext = createContext<TooltipManagerContextValue>({
  activeNodeId: null,
  show: () => {},
  hide: () => {},
});

export function useTooltipManager() {
  return useContext(TooltipManagerContext);
}

interface TooltipManagerProviderProps {
  nodes: Node[];
  edges: Edge[];
  children: React.ReactNode;
}

const SHOW_DELAY = 300;
const HIDE_DELAY = 200;

export function TooltipManagerProvider({ nodes, edges, children }: TooltipManagerProviderProps) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<BadgeTooltipContent | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringTooltipRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (nodeId: string, anchor: HTMLElement) => {
      clearTimers();
      // If a different tooltip is already showing, close it immediately
      if (activeNodeId && activeNodeId !== nodeId) {
        setActiveNodeId(null);
        setContent(null);
      }

      showTimerRef.current = setTimeout(() => {
        setActiveNodeId(nodeId);
        setAnchorEl(anchor);
        // Build content async
        buildTooltipContent(nodeId, nodes, edges).then((c) => {
          setContent(c);
        });
      }, SHOW_DELAY);
    },
    [clearTimers, activeNodeId, nodes, edges],
  );

  const hide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringTooltipRef.current) {
        setActiveNodeId(null);
        setContent(null);
      }
    }, HIDE_DELAY);
  }, [clearTimers]);

  const handleTooltipMouseEnter = useCallback(() => {
    isHoveringTooltipRef.current = true;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    isHoveringTooltipRef.current = false;
    hide();
  }, [hide]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeNodeId) {
        clearTimers();
        isHoveringTooltipRef.current = false;
        setActiveNodeId(null);
        setContent(null);
      }
    },
    [activeNodeId, clearTimers],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  // Close tooltip on cleanup
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return (
    <TooltipManagerContext.Provider value={{ activeNodeId, show, hide }}>
      {children}
      {activeNodeId && anchorEl && content && (
        <TooltipPortal
          anchorEl={anchorEl}
          content={content}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />
      )}
    </TooltipManagerContext.Provider>
  );
}

// ─── Tooltip Portal ───────────────────────────────────────────

interface TooltipPortalProps {
  anchorEl: HTMLElement;
  content: BadgeTooltipContent;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function TooltipPortal({ anchorEl, content, onMouseEnter, onMouseLeave }: TooltipPortalProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });

  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipMaxHeight = 400;
    const offset = 8;

    let top: number;
    let placement: 'bottom' | 'top' = 'bottom';

    // Check if there's enough space below
    if (rect.bottom + offset + tooltipMaxHeight > window.innerHeight) {
      // Flip to top
      top = rect.top - offset;
      placement = 'top';
    } else {
      top = rect.bottom + offset;
    }

    // Center horizontally, but clamp to viewport
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipWidth - 4));

    setPosition({ top, left, placement });
  }, [anchorEl]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: position.placement === 'top' ? undefined : position.top,
    bottom: position.placement === 'top' ? window.innerHeight - position.top : undefined,
    left: position.left,
    width: 320,
    maxHeight: 400,
    zIndex: 9999,
  };

  return createPortal(
    <div
      ref={tooltipRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
      data-testid="badge-tooltip"
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-3">
        <TooltipBody content={content} />
      </div>
    </div>,
    document.body,
  );
}

// ─── Type-Specific Tooltip Renderers ──────────────────────────

function TooltipBody({ content }: { content: BadgeTooltipContent }) {
  switch (content.type) {
    case 'extract':
      return <ExtractTooltip content={content} />;
    case 'merge':
      return <MergeTooltip content={content} />;
    case 'dedup':
      return <DedupTooltip content={content} />;
    case 'derived':
      return <DerivedTooltip content={content} />;
    case 'mapping':
      return <MappingTooltip content={content} />;
    case 'typecast':
      return <TypecastTooltip content={content} />;
    case 'conditional':
      return <ConditionalTooltip content={content} />;
    case 'load':
      return <LoadTooltip content={content} />;
    case 'code_decode':
      return <CodeDecodeTooltip content={content} />;
    case 'passthrough':
      return <PassthroughTooltip content={content} />;
  }
}

/** Shared tooltip header component */
function TooltipHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2 pb-1.5 border-b border-gray-100">
      {children}
    </div>
  );
}

/** Shared section title */
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-semibold text-gray-400 mb-1 ${className || ''}`}>
      {children}
    </div>
  );
}

/** Shared field row with dot */
function FieldRow({ name, dotColor, mono }: { name: string; dotColor: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-[3px] text-[12px]" data-testid="tooltip-field-item">
      <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${dotColor}`} />
      <span className={mono ? 'font-mono text-[11px]' : ''}>{name}</span>
    </div>
  );
}

/** Truncation hint */
function TruncatedHint({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <div className="text-[11px] text-gray-400 mt-1 pl-[11px]" data-testid="tooltip-truncated">
      ... 及其他 {count} {label || '個欄位'}
    </div>
  );
}

// ─── Extract ─────────────────────────────────────────────────

function ExtractTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'extract' }> }) {
  return (
    <>
      <TooltipHeader>Extract - 來源擷取</TooltipHeader>
      <div className="text-[12px] text-gray-500 mb-1.5">
        <span className="font-medium text-gray-700">來源表：</span>{content.tableName}
      </div>
      <div className="text-[12px] text-gray-500 mb-2">
        <span className="font-medium text-gray-700">輸出欄位數：</span>
        <span className="text-blue-600 font-semibold">{content.fieldCount}</span>
      </div>
      <SectionTitle>欄位列表</SectionTitle>
      {content.fields.map((f) => (
        <FieldRow key={f} name={f} dotColor="bg-blue-600" mono />
      ))}
      <TruncatedHint count={content.remainingCount} />
    </>
  );
}

// ─── Merge ───────────────────────────────────────────────────

function MergeTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'merge' }> }) {
  const onlyLeft = content.leftCount - content.overlapCount;
  const onlyRight = content.rightCount - content.overlapCount;

  return (
    <>
      <TooltipHeader>Merge - 合併</TooltipHeader>
      <div className="text-[12px] mb-1.5">
        <span className="font-medium text-gray-700">Join 類型：</span>
        <span className="text-amber-500 font-semibold">{content.joinType || 'FULL'}</span>
      </div>
      {content.joinKey && (
        <div className="text-[12px] mb-2">
          <span className="font-medium text-gray-700">Join Key：</span>
          <span className="font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500">
            {content.joinKey}
          </span>
        </div>
      )}
      {/* 3-column stat cards */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 py-1.5 px-2 rounded-md bg-blue-600/[0.06] border border-blue-600/[0.15] text-center">
          <div className="text-[18px] font-bold text-blue-600">{content.leftCount}</div>
          <div className="text-[10px] text-gray-500">左輸入</div>
        </div>
        <div className="flex-1 py-1.5 px-2 rounded-md bg-amber-500/[0.06] border border-amber-500/[0.15] text-center">
          <div className="text-[18px] font-bold text-amber-500">{content.rightCount}</div>
          <div className="text-[10px] text-gray-500">右輸入</div>
        </div>
        <div className="flex-1 py-1.5 px-2 rounded-md bg-green-500/[0.06] border border-green-500/[0.15] text-center">
          <div className="text-[18px] font-bold text-green-500">{content.outputCount}</div>
          <div className="text-[10px] text-gray-500">輸出</div>
        </div>
      </div>
      <SectionTitle>欄位分類</SectionTitle>
      <FieldRow name={`重疊欄位：${content.overlapCount}`} dotColor="bg-gray-400" />
      <FieldRow name={`僅左側：${onlyLeft}`} dotColor="bg-blue-600" />
      <FieldRow name={`僅右側：${onlyRight}`} dotColor="bg-amber-500" />
    </>
  );
}

// ─── Dedup ───────────────────────────────────────────────────

function DedupTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'dedup' }> }) {
  const strategyText =
    content.strategy === 'latest_timestamp' ? '保留最新時間戳' : content.strategy || '—';
  return (
    <>
      <TooltipHeader>Dedup - 去重</TooltipHeader>
      {content.keyColumn && (
        <div className="text-[12px] mb-1.5">
          <span className="font-medium text-gray-700">去重鍵：</span>
          <span className="font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500">
            {content.keyColumn}
          </span>
        </div>
      )}
      <div className="text-[12px] mb-1.5">
        <span className="font-medium text-gray-700">保留策略：</span>
        <span className="text-gray-500">{strategyText}</span>
      </div>
      {content.timestampColumn && (
        <div className="text-[12px] mb-2">
          <span className="font-medium text-gray-700">時間戳欄位：</span>
          <span className="font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500">
            {content.timestampColumn}
          </span>
        </div>
      )}
      <div className="p-2 rounded-md bg-gray-50 text-center">
        <div className="text-[11px] text-gray-400">輸出欄位數</div>
        <div className="text-[20px] font-bold text-gray-500">{content.outputCount}</div>
        <div className="text-[10px] text-gray-400">（欄位不變，僅去除重複列）</div>
      </div>
    </>
  );
}

// ─── Derived Field ───────────────────────────────────────────

function DerivedTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'derived' }> }) {
  return (
    <>
      <TooltipHeader>Derived Field - 衍生欄位</TooltipHeader>
      <div className="text-[12px] text-gray-500 mb-2">
        新增 <span className="text-green-500 font-semibold">{content.expressions.length}</span> 個衍生欄位
      </div>
      {content.expressions.map((ex) => (
        <div
          key={ex.name}
          className="p-1.5 px-2 rounded-md bg-green-500/[0.06] border border-green-500/[0.12] mb-1.5"
        >
          <div className="flex items-center gap-1.5 mb-[3px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-[12px] font-semibold text-green-600">{ex.name}</span>
            {ex.outputType && (
              <span className="text-[10px] text-gray-400 ml-auto">{ex.outputType}</span>
            )}
          </div>
          {ex.expression && (
            <div className="font-mono text-[10px] leading-[1.4] bg-gray-50 px-1 py-[2px] rounded text-gray-500 break-all">
              {ex.expression}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ─── Field Mapping ───────────────────────────────────────────

function MappingTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'mapping' }> }) {
  return (
    <>
      <TooltipHeader>Field Mapping - 欄位對應</TooltipHeader>
      {/* Stat cards */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 text-center p-1 rounded bg-gray-50">
          <div className="text-[16px] font-bold text-gray-700">{content.inputCount}</div>
          <div className="text-[10px] text-gray-400">輸入</div>
        </div>
        <div className="flex items-center text-gray-400 text-[16px]">→</div>
        <div className="flex-1 text-center p-1 rounded bg-green-500/[0.06]">
          <div className="text-[16px] font-bold text-green-500">{content.outputCount}</div>
          <div className="text-[10px] text-gray-400">輸出</div>
        </div>
        {content.dropCount > 0 && (
          <div className="flex-1 text-center p-1 rounded bg-red-500/[0.06]">
            <div className="text-[16px] font-bold text-red-500">-{content.dropCount}</div>
            <div className="text-[10px] text-gray-400">丟棄</div>
          </div>
        )}
      </div>
      <SectionTitle>對應規則（前 {Math.min(content.mappings.length, 8)} 筆）</SectionTitle>
      {content.mappings.map((m) => (
        <div key={m.source} className="flex items-center gap-1.5 py-[3px] text-[12px]" data-testid="tooltip-field-item">
          <span className="w-[5px] h-[5px] rounded-full flex-shrink-0 bg-green-500" />
          <span className="font-mono text-[11px]">{m.source}</span>
          <span className="text-gray-400 text-[11px]">→</span>
          <span className="font-mono text-[11px] text-green-600">{m.target}</span>
        </div>
      ))}
      <TruncatedHint count={content.mappingRemainingCount} label="組對應" />
      {content.droppedFields.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-gray-100">
          <SectionTitle className="!text-red-500">丟棄欄位（前 {content.droppedFields.length} 筆）</SectionTitle>
          {content.droppedFields.map((d) => (
            <div key={d} className="flex items-center gap-1.5 py-[3px] text-[12px]" data-testid="tooltip-field-item">
              <span className="w-[5px] h-[5px] rounded-full flex-shrink-0 bg-red-500" />
              <span className="font-mono text-[11px] text-red-500 line-through">{d}</span>
            </div>
          ))}
          <TruncatedHint count={content.droppedRemainingCount} label="個丟棄欄位" />
        </div>
      )}
    </>
  );
}

// ─── Type Cast ───────────────────────────────────────────────

function TypecastTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'typecast' }> }) {
  return (
    <>
      <TooltipHeader>Type Cast - 型別轉換</TooltipHeader>
      <div className="text-[12px] text-gray-500 mb-2">
        共 <span className="font-semibold text-gray-700">{content.casts.length}</span> 個欄位需要轉換
      </div>
      {content.casts.map((c) => (
        <div key={c.column} className="p-1.5 px-2 rounded-md bg-gray-50 border border-gray-100 mb-1.5">
          <div className="text-[12px] font-semibold text-gray-700 font-mono mb-[3px]">{c.column}</div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {c.fromType && (
              <span className="px-1.5 py-[1px] rounded bg-red-500/10 text-red-500">{c.fromType}</span>
            )}
            <span className="text-gray-400">→</span>
            <span className="px-1.5 py-[1px] rounded bg-green-500/10 text-green-500">{c.toType}</span>
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Conditional ─────────────────────────────────────────────

function ConditionalTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'conditional' }> }) {
  return (
    <>
      <TooltipHeader>Conditional - 條件規則</TooltipHeader>
      <div className="text-[12px] text-gray-500 mb-2">
        共 <span className="font-semibold text-amber-500">{content.ruleCount}</span> 條衝突解決規則
      </div>
      {content.rules.map((r) => (
        <div key={r.index} className="p-1.5 px-2 rounded-md bg-amber-500/[0.06] border border-amber-500/[0.12] mb-1.5">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/[0.15] px-[5px] py-[1px] rounded">
              #{r.index}
            </span>
            <span className="text-[12px] font-semibold text-gray-700 font-mono">{r.target}</span>
          </div>
          {r.when && (
            <div className="text-[11px] mb-[2px]">
              <span className="text-amber-500 font-medium">WHEN</span>
              <span className="ml-1 font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500 break-all">
                {r.when}
              </span>
            </div>
          )}
          {r.then && (
            <div className="text-[11px] mb-[2px]">
              <span className="text-green-500 font-medium">THEN</span>
              <span className="ml-1 font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500 break-all">
                {r.then}
              </span>
            </div>
          )}
          {r.else_ && (
            <div className="text-[11px]">
              <span className="text-gray-400 font-medium">ELSE</span>
              <span className="ml-1 font-mono text-[11px] bg-gray-50 px-1 py-[2px] rounded text-gray-500 break-all">
                {r.else_}
              </span>
            </div>
          )}
        </div>
      ))}
      {content.remainingCount > 0 && (
        <div className="text-[11px] text-gray-400 mt-[2px]">
          ... 及其他 {content.remainingCount} 條規則
        </div>
      )}
    </>
  );
}

// ─── Target Load ─────────────────────────────────────────────

function LoadTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'load' }> }) {
  return (
    <>
      <TooltipHeader>Target Load - 載入目標表</TooltipHeader>
      {content.targetTable && (
        <div className="text-[12px] mb-1.5">
          <span className="font-medium text-gray-700">目標表：</span>
          <span className="text-green-500 font-semibold font-mono">{content.targetTable}</span>
        </div>
      )}
      <div className="text-[12px] mb-2">
        <span className="font-medium text-gray-700">載入欄位：</span>
        <span className="text-green-500 font-semibold">{content.fieldCount}</span>
      </div>
      {content.fields.length > 0 && (
        <>
          <SectionTitle>欄位列表</SectionTitle>
          {content.fields.map((f) => (
            <FieldRow key={f} name={f} dotColor="bg-green-500" mono />
          ))}
          <TruncatedHint count={content.remainingCount} />
        </>
      )}
    </>
  );
}

// ─── Code Decode ─────────────────────────────────────────────

function CodeDecodeTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'code_decode' }> }) {
  return (
    <>
      <TooltipHeader>Code Decode - 代碼解碼</TooltipHeader>
      {content.source && (
        <div className="text-[12px] mb-1.5">
          <span className="font-medium text-gray-700">對照字典：</span>
          <span className="text-amber-500 font-semibold font-mono">{content.source}</span>
        </div>
      )}
      <div className="text-[12px] text-gray-500 mb-2">
        <span className="font-semibold text-amber-500">{content.mappingCount}</span> 組解碼 ·
        新增 <span className="font-semibold text-amber-500">{content.decodeCount}</span> 個描述欄位
      </div>
      {content.outputs.length > 0 && (
        <>
          <SectionTitle>解碼欄位（代碼欄 → 描述欄）</SectionTitle>
          {content.outputs.map((o) => (
            <div
              key={`${o.matchColumn}>${o.alias}`}
              className="flex items-center gap-1.5 py-[3px] text-[12px]"
              data-testid="tooltip-field-item"
            >
              <span className="w-[5px] h-[5px] rounded-full flex-shrink-0 bg-amber-500" />
              <span className="font-mono text-[11px]">{o.matchColumn}</span>
              <span className="text-gray-400 text-[11px]">→</span>
              <span className="font-mono text-[11px] text-amber-600">{o.alias}</span>
            </div>
          ))}
          <TruncatedHint count={content.remainingCount} label="個描述欄位" />
        </>
      )}
    </>
  );
}

// ─── Passthrough ─────────────────────────────────────────────

function PassthroughTooltip({ content }: { content: Extract<BadgeTooltipContent, { type: 'passthrough' }> }) {
  return (
    <>
      <TooltipHeader>輸出欄位（{content.outputCount}）— 透傳</TooltipHeader>
      <SectionTitle>欄位</SectionTitle>
      {content.fields.map((f) => (
        <FieldRow key={f} name={f} dotColor="bg-gray-400" mono />
      ))}
      <TruncatedHint count={content.remainingCount} />
      <div className="text-[12px] text-gray-500 mt-2">此節點不增減欄位</div>
    </>
  );
}
