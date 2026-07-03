import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { User } from '@/database/entities/user.entity';
import { activeEmphireCondition, todayYmd } from '@/common/emphire/emphire-active.util';

export interface ActorUser {
  userId: string;
  role: string;
  businessRole?: string | null;
}

/**
 * SectionChiefScopeService — E07 處長轄區共用 helper
 *
 * 對應 spec：
 *   - F074 v2.1 BR-1（轄區判定改用 ob_emphire 反查）
 *   - F077 v1.4 BR-4（list-definition 處長過濾）
 *   - F082 v1.5 BR-3 / BR-14（personnel ratio 處長過濾）
 *   - F063 v1.1 BR-6 / F064 v1.1 / F066 v1.1 / F067 v1.1（月跑後報表 emplid 過濾，沿用 created_by）
 *
 * 兩種 scope 機制並存：
 *   - **getScopeDeptCode(userId)**（v2.1 新增）：透過 `users.email ↔ ob_emphire.email + jfun_nm='處長' + 在職`
 *     反查 dept_code。給「需操作或檢視名單／個別比例設定」之 feature 使用（F077 / F082 / F088 / F089）。
 *     避免 chicken-and-egg（首次 GET 時 ob_empl_set 為空 → 無轄區資料 → 處長看不到任何東西）。
 *   - **getScopeEmplIds(userId)**（舊 API）：依 `ob_empl_set.created_by = currentUserId` 取得 emplid。
 *     只給「月跑後的指派結果報表」用（F063/F064/F066/F067），因該情境下 ob_empl_set 必然已有資料。
 */
@Injectable()
export class SectionChiefScopeService {
  constructor(
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 透過 ob_emphire 反查處長的轄區 dept_code（F074 v2.1 BR-1 / F077 v1.4 / F082 v1.5）。
   *
   * 條件：
   *   - users.email 對應某個 ob_emphire 員工的 email（trimmed + case-insensitive）
   *   - 該員工在職（resign_date 為 NULL 或 >= 系統日；哨兵 9999-12-31 = 永久在職）
   *   - 該員工 jfun_nm = '處長'
   *
   * @returns 對應的 dept_code（trimmed），或 null 表示對不上 / 非處長身份
   */
  async getScopeDeptCode(userId: string): Promise<string | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.email) return null;
    const emp = await this.emphireRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.email)) = LOWER(:email)', { email: user.email.trim() })
      // 在職判定對齊 legacy（NULL 或 resign_date >= 系統日；哨兵 9999-12-31）；勿用 `IS NULL`。
      .andWhere(activeEmphireCondition('e'), { sysDate: todayYmd() })
      .getOne();
    if (!emp) return null;
    if ((emp.jfun_nm ?? '').trim() !== '處長') return null;
    const deptCode = (emp.dept_code ?? '').trim();
    return deptCode || null;
  }

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
