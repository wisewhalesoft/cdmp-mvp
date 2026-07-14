/**
 * F066 — 計分卡（CARD_TYPE）彩色 badge（共用於設定快照 / 輸入名單）
 *
 * 依代碼給穩定顏色。快照 payload 僅帶代碼、不含卡別中文名（名稱來源為 ob_card_type，
 * 不在快照內），故以「彩色代碼 badge」呈現，不臆造名稱。
 */

const TONES = [
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
];

function toneFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function CardTypeBadge({ code }: { code?: string | null }) {
  if (!code) return <span className="text-gray-300">—</span>;
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${toneFor(code)}`}
    >
      {code}
    </span>
  );
}
