import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ObCardType } from '@/database/entities/ob-card-type.entity';

/**
 * cardType 範圍鎖 helper（共用於 F053/F054/F055/F056）。
 *
 * 規則（依 F056 v1.5 AC-9）：所有 scoring 寫入 / 讀取端點之 cardType 必須對應
 *   ob_card_type.status='active'，否則回 404 CARD_TYPE_NOT_FOUND。
 *
 * 設計理由：將 cardType 範圍鎖獨立為 helper，使 Iter 3 (F056 v1.5) 與 Iter 4
 *   (F053/F054/F055 補範圍鎖) 可共用同一實作；錯誤碼與 F069~F072 之
 *   CARD_TYPE_NOT_FOUND 一致。
 *
 * @param repo      ObCardType repository
 * @param cardType  待驗證的 cardType code
 */
export async function assertCardTypeActive(
  repo: Repository<ObCardType>,
  cardType: string,
): Promise<void> {
  const existing = await repo.findOne({
    where: { card_type: cardType, status: 'active' },
  });
  if (!existing) {
    throw new NotFoundException({
      error: 'CARD_TYPE_NOT_FOUND',
      message: `計分卡類型 ${cardType} 不存在或已停用`,
    });
  }
}
