import { useQuery } from '@tanstack/react-query';
import {
  previewCardLevels,
  type CardLevelItem,
  type CardType,
  type PreviewCardLevelsResponse,
} from '@/api/assignment-scoring';

/**
 * AD-E07-45 v1.2 / I-SAMPLE-CLIENT-HISTOGRAM-01：per-cardType histogram 共用快取。
 *
 * `GET .../card-levels/preview` 回應之 `histogram` 為 threshold-/tier-independent，故對同一
 * cardType 於同一 session 內僅需成功呼叫一次。queryKey 僅以 `cardType` 為鍵（不含 levels），
 * staleTime=Infinity → 門檻編輯 / Tab 4↔Tab 5 切換皆重用此快取，不重新掃描。
 *
 * 因 queryKey 不含 levels，Tab 4（CardLevelsTab）與 Tab 5（TierMappingTabV15）以相同 cardType
 * 呼叫本 hook 時，React Query 於同一 QueryClient 下自動去重共享同一份 histogram（不同 tab 切換
 * 不觸發新請求，AD-E07-45 §3.4.2）。
 *
 * @param levels 首次抓取傳給後端之門檻（histogram 與其無關，僅用於端點必填參數）
 */
export function useCardLevelHistogram(
  cardType: CardType | string | null | undefined,
  levels: CardLevelItem[],
  enabled = true,
) {
  return useQuery<PreviewCardLevelsResponse>({
    queryKey: ['card-level-histogram', cardType],
    queryFn: () => previewCardLevels(cardType as CardType, levels),
    // 不以 levels.length 為 enabled 條件：histogram 與門檻無關（fallback cardType 無等級門檻時
    // 仍需取得 histogram 供 TIER 彙總，AD-E07-45 §3.4.2）。
    enabled: enabled && !!cardType,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
