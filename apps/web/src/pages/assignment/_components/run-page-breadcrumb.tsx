import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * 月跑下游頁共用麵包屑：執行歷史 › {目前頁}
 *
 * 取代各頁 header 原本的「返回箭頭 + 標題 + 長版 runId code」組合
 * （長版 runId 不在 prototype 規劃內 — header 只規劃了頁標題）。
 * 對應 prototype 32-run-progress / 33-run-summary / 35-snapshot-detail / 36-run-compare header。
 *
 * 根節點「執行歷史」連回 /assignment/history（= prototype 34-run-history.html），
 * 取代原本返回箭頭的導航功能；leaf 為目前頁（aria-current=page，非連結）。
 */
export interface RunPageBreadcrumbProps {
  /** 目前頁名（leaf），例如「結果摘要」。對齊各 prototype header 標題。 */
  leaf: string;
}

export function RunPageBreadcrumb({ leaf }: RunPageBreadcrumbProps) {
  return (
    <nav
      className="flex items-center gap-1.5 text-sm"
      aria-label="breadcrumb"
      data-testid="run-breadcrumb"
    >
      <Link
        to="/assignment/history"
        className="text-gray-500 hover:text-primary transition"
      >
        執行歷史
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
      <span className="font-semibold text-gray-800" aria-current="page">
        {leaf}
      </span>
    </nav>
  );
}
