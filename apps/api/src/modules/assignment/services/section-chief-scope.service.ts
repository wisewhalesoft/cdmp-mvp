import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';

export interface ActorUser {
  userId: string;
  role: string;
  businessRole?: string | null;
}

/**
 * SectionChiefScopeService — F063/F064/F066/F067 v1.1 共用 scopeByCreator helper
 *
 * 對應 spec：
 *   - F063 v1.1 BR-6 + BR-7
 *   - F064 v1.1 / F066 v1.1 / F067 v1.1（同 pattern）
 *
 * 設計（與 PersonnelRatioService.isSectionChiefOnly + emplSet.created_by 過濾 pattern 一致）：
 *   - admin / director：bypass（不過濾）
 *   - section_chief：依 ob_empl_set.created_by = currentUserId 取得處長轄區 emplid 集合
 *   - 過濾語意（非拒絕）：縮小集合，不會回 403 / 422
 *
 * 注意：scope 以 ob_empl_set.created_by 為依據（與 personnel-ratio.service 一致），
 *       而非 ob_emphire（後者無 created_by 欄位）。月跑 snapshot 中的 assignments[].emplid
 *       對應到此 emplid 集合，故能正確 filter。
 */
@Injectable()
export class SectionChiefScopeService {
  constructor(
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
  ) {}

  /**
   * 判斷是否需要 scope filter。
   *
   * @returns true 表示 actor 為 section_chief 且需 filter；false 為 director / admin / 無 actor → bypass
   */
  shouldFilter(actor?: ActorUser | null): boolean {
    if (!actor) return false;
    if (actor.role === 'admin') return false;
    return actor.businessRole === 'section_chief';
  }

  /**
   * 取得處長轄區內之 emplid 集合（從 ob_empl_set.created_by = currentUserId）。
   *
   * @returns Set of emplid（不含轄區則為空 Set）
   */
  async getScopeEmplIds(actorUserId: string): Promise<Set<string>> {
    const rows = await this.emplSetRepo
      .createQueryBuilder('s')
      .select('s.emplid', 'emplid')
      .where('s.created_by = :uid', { uid: actorUserId })
      .getRawMany<{ emplid: string }>();
    const out = new Set<string>();
    for (const r of rows) {
      if (r.emplid != null) out.add(String(r.emplid).trim());
    }
    return out;
  }

  /**
   * Filter assignments by emplid set。null actor / bypass → 原列表。
   */
  async filterByEmplId<T extends { emplid?: string | null }>(
    items: T[],
    actor?: ActorUser | null,
  ): Promise<T[]> {
    if (!this.shouldFilter(actor)) return items;
    const scope = await this.getScopeEmplIds(actor!.userId);
    return items.filter((x) => x.emplid != null && scope.has(String(x.emplid).trim()));
  }
}
