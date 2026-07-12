import { apiClient } from './client';
import type { AssignmentOverviewResponse } from '@cdmp/shared';

/**
 * F111 / US-177 分派總覽儀表板 — 唯讀聚合端點 API client。
 *
 * 對應後端 `GET /api/v1/assignment/overview?ym=<YYYYMM>`（AD-E07-46）。
 * 單一薄型聚合端點：四大區塊共用同一次 fetch 結果（TanStack Query 單一 key
 * `['assignment','overview',ym]`）。純唯讀，不含任何寫入操作（I-OVW-NO-WRITE-01）。
 */

export async function getAssignmentOverview(
  ym: string,
): Promise<AssignmentOverviewResponse> {
  const res = await apiClient.get<AssignmentOverviewResponse>(
    '/assignment/overview',
    { params: { ym } },
  );
  return res.data;
}
