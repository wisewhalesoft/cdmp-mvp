import { Construction } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';

/**
 * E07 客戶名單分派子項佔位頁。
 *
 * 為了讓 sidebar 子項點擊不會落到 catch-all `/login`，提供 11 個對應 stub 路由。
 * 顯示「功能開發中」訊息，後續 feature 實作後可逐一替換。
 *
 * 套用 SalesManagerRoute Guard（admin OR isSalesManager === true 才能進入）。
 */

export interface AssignmentStubPageProps {
  title: string;
  description?: string;
}

export function AssignmentStubPage({ title, description }: AssignmentStubPageProps) {
  return (
    <AppLayout title={title}>
      <main className="flex-1 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Construction className="w-8 h-8 text-[#F59E0B]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
          <p className="text-sm text-gray-500">
            {description ?? '此功能開發中，敬請期待。'}
          </p>
        </div>
      </main>
    </AppLayout>
  );
}
