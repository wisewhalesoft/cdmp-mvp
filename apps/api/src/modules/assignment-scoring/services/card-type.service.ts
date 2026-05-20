import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import {
  assertNotLocked,
  AssignmentLockKind,
} from '../helpers/assignment-lock.helper';
import {
  assertProdKindActive,
  sdateToday,
} from '../helpers/prod-kind.helper';

/**
 * F069 / F070 / F071 / F072：CARD_TYPE 計分卡類型主檔 CRUD Service
 *
 * 對應 spec：F069/F070/F071/F072
 * 對應 entity：ob_card_type（Iter 1）
 *
 * 設計重點：
 *   - 月跑鎖：assertNotLocked(runRepo, 'card-type-crud') → 409 ASSIGNMENT_RUN_ALREADY_RUNNING
 *   - PROD_KIND 業務驗證：assertProdKindActive（F070 AC-5 / F071 AC-6）
 *   - F070 createCardType：透過 DataSource.transaction 同步寫入 ob_card_type +
 *     ob_levelcard_version（v1）+ audit log；任一失敗整體 rollback
 *   - F072 deleteCardTypeCascade：transaction 6 步驟 hard delete；ob_tier 採
 *     `manager.remove(entities)` 路徑（memory feedback_typeorm_null_pk_delete 守護）
 *   - F071 BR-4：ob_levelcard_version.card_name 不同步（兩表獨立維護）
 */

export const CARD_TYPE_ERROR_CODES = {
  CARD_TYPE_NOT_FOUND: 'CARD_TYPE_NOT_FOUND',
  CARD_TYPE_DUPLICATE: 'CARD_TYPE_DUPLICATE',
  CARD_TYPE_CASCADE_NOT_CONFIRMED: 'CARD_TYPE_CASCADE_NOT_CONFIRMED',
  ASSIGNMENT_RUN_ALREADY_RUNNING: 'ASSIGNMENT_RUN_ALREADY_RUNNING',
} as const;

export const CARD_TYPE_ERROR_MESSAGES = {
  CARD_TYPE_NOT_FOUND: '指定的計分卡類型不存在',
  CARD_TYPE_DUPLICATE: '計分卡代碼已存在，請使用其他代碼',
  CARD_TYPE_CASCADE_NOT_CONFIRMED:
    '級聯刪除需要二次確認，請於請求帶上 confirmCascade=true',
  ASSIGNMENT_RUN_ALREADY_RUNNING: '分派執行中，無法修改計分卡類型設定',
} as const;

// =========================
// Types
// =========================

export interface ActorContext {
  userId: string;
  ipAddress?: string | null;
}

export interface CardTypeListItem {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active' | 'inactive';
  // Iter 9：banner metadata（active version JOIN + users.name JOIN）
  cardVersion: number | null;
  sdate: string | null;
  edate: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface ListCardTypesResult {
  cardTypes: CardTypeListItem[];
}

/**
 * Iter 9：GET /:cardType/stats response。
 * banner KPI 5 欄一次回（dim/score/level/tier/listDefsAffected）。
 */
export interface CardTypeStatsResult {
  cardType: string;
  dimCount: number;
  scoreCount: number;
  levelCount: number;
  tierCount: number;
  listDefsAffected: number;
}

export interface CreateCardTypeInput {
  cardType: string;
  cardName: string;
  prodKind: string;
}

export interface CreateCardTypeResult {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active';
  cardVersion: number;
  createdAt: string;
}

export interface UpdateCardTypeInput {
  cardName: string;
  prodKind: string;
}

export interface UpdateCardTypeResult {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active' | 'inactive';
  updatedAt: string;
}

export interface CascadeCountSummary {
  versions: number;
  columns: number;
  scores: number;
  levels: number;
  tierMappings: number;
}

export interface DeletePreviewResult {
  cardType: string;
  cardName: string;
  cascade: CascadeCountSummary;
  listDefinitionsAffected: number;
}

export interface DeleteCardTypeResult {
  cardType: string;
  deletedCascade: CascadeCountSummary;
  listDefinitionsAffected: number;
  deletedAt: string;
}

@Injectable()
export class CardTypeService {
  constructor(
    @InjectRepository(ObCardType)
    private readonly cardTypeRepo: Repository<ObCardType>,
    // v2.1 重構（AD-E07-18 §18.2.7 / §18.7）：prodKindName 來源從 ob_code_df
    // 改讀 pooldata_field_option（M5 deployment gate 同 commit）
    @InjectRepository(PooldataFieldOption)
    private readonly optionRepo: Repository<PooldataFieldOption>,
    @InjectRepository(ObLevelcardVersion)
    private readonly versionRepo: Repository<ObLevelcardVersion>,
    @InjectRepository(ObLevelcardColumn)
    private readonly columnRepo: Repository<ObLevelcardColumn>,
    @InjectRepository(ObLevelcardScore)
    private readonly scoreRepo: Repository<ObLevelcardScore>,
    @InjectRepository(ObLevelcardLevel)
    private readonly levelRepo: Repository<ObLevelcardLevel>,
    @InjectRepository(ObTier)
    private readonly tierRepo: Repository<ObTier>,
    @InjectRepository(ObListDefinition)
    private readonly listDefRepo: Repository<ObListDefinition>,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Test seam：F070 transaction rollback 守護測試（TC-F070-17）會 override 此 hook，
   * 模擬 ob_levelcard_version INSERT 失敗。生產環境此 hook 為 no-op。
   */
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  protected async _afterVersionInsertHook(_cardType: string): Promise<void> {
    // no-op (production)
  }

  // =========================
  // F069 — GET /card-types
  // =========================

  async listCardTypes(
    query: { status?: 'active' | 'all' } = {},
  ): Promise<ListCardTypesResult> {
    const statusFilter = query.status === 'all' ? undefined : 'active';

    const where: any = {};
    if (statusFilter) where.status = statusFilter;

    const cards = await this.cardTypeRepo.find({ where });

    // v2.1 重構（AD-E07-18 §18.2.7 / §18.7）：取得對應 PROD_KIND 名稱
    // 從 pooldata_field_option（column_name='prod_kind'）join
    const prodKinds = Array.from(new Set(cards.map((c) => c.prod_kind)));
    const prodKindRows =
      prodKinds.length === 0
        ? []
        : await this.optionRepo.find({
            where: prodKinds.map((pk) => ({
              column_name: 'prod_kind' as any,
              option_value: pk as any,
            })),
          });

    const prodKindNameByCode = new Map<string, string | null>();
    for (const row of prodKindRows) {
      // F069 BE-F069-001 v2.1：option is_active=false → 顯示 null（鍵不設，後續 ?? null）
      if (row.is_active) {
        prodKindNameByCode.set(row.option_value, row.option_label ?? null);
      }
    }

    // Iter 9：JOIN active version（每張卡最多一筆）取 cardVersion / sdate / edate
    const cardTypeCodes = cards.map((c) => c.card_type);
    const activeVersions =
      cardTypeCodes.length === 0
        ? []
        : await this.versionRepo.find({
            where: cardTypeCodes.map((ct) => ({
              card_type: ct as any,
              status: 'active',
            })),
          });
    const versionByCardType = new Map<string, ObLevelcardVersion>();
    for (const v of activeVersions) {
      if (v.card_type) versionByCardType.set(v.card_type, v);
    }

    // Iter 9：JOIN users 取 createdBy name
    const createdByIds = Array.from(
      new Set(cards.map((c) => c.created_by).filter((id): id is string => !!id)),
    );
    const users =
      createdByIds.length === 0
        ? []
        : await this.userRepo.find({
            where: createdByIds.map((id) => ({ id })),
            select: ['id', 'name'],
          });
    const userNameById = new Map<string, string | null>();
    for (const u of users) {
      userNameById.set(u.id, u.name ?? null);
    }

    const sorted = [...cards].sort((a, b) =>
      a.card_type.localeCompare(b.card_type),
    );

    return {
      cardTypes: sorted.map((c) => {
        const v = versionByCardType.get(c.card_type) ?? null;
        const createdAt = c.created_at
          ? c.created_at instanceof Date
            ? c.created_at.toISOString()
            : String(c.created_at)
          : null;
        return {
          cardType: c.card_type,
          cardName: c.card_name,
          prodKind: c.prod_kind,
          prodKindName: prodKindNameByCode.get(c.prod_kind) ?? null,
          status: c.status as 'active' | 'inactive',
          cardVersion: v?.card_version ?? null,
          sdate: v?.sdate ?? null,
          edate: v?.edate ?? null,
          createdBy: c.created_by ? userNameById.get(c.created_by) ?? null : null,
          createdAt,
        };
      }),
    };
  }

  // =========================
  // Iter 9 — GET /card-types/:cardType/stats
  // =========================

  async getCardTypeStats(cardType: string): Promise<CardTypeStatsResult> {
    // 1. 確認 cardType 存在（不限 status — banner 可能仍要看到 inactive 卡）
    const card = await this.cardTypeRepo.findOne({
      where: { card_type: cardType },
    });
    if (!card) {
      throw new NotFoundException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_NOT_FOUND,
        message: `計分卡類型 ${cardType} 不存在`,
      });
    }

    // 2. 5 個 count 並行查詢（_countCascade 已 cover dim/score/level/tier 4 個，
    //    listDefsAffected 用 _countActiveListDefinitions）
    const cascade = await this._countCascade(cardType);
    const listDefsAffected = await this._countActiveListDefinitions(cardType);

    return {
      cardType,
      // dim = columns 數量（cascade.columns 即計分維度）
      dimCount: cascade.columns,
      scoreCount: cascade.scores,
      levelCount: cascade.levels,
      tierCount: cascade.tierMappings,
      listDefsAffected,
    };
  }

  // =========================
  // F070 — POST /card-types
  // =========================

  async createCardType(
    input: CreateCardTypeInput,
    actor: ActorContext,
  ): Promise<CreateCardTypeResult> {
    // BR-5：月跑鎖
    await assertNotLocked(this.runRepo, 'card-type-crud');

    // BR-2：cardType 唯一性（status='active' 範圍）
    const existing = await this.cardTypeRepo.findOne({
      where: { card_type: input.cardType, status: 'active' },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_DUPLICATE,
        message: `計分卡代碼 ${input.cardType} 已存在，請使用其他代碼`,
        details: { field: 'cardType', value: input.cardType },
      });
    }

    // AC-5 v2.1：prodKind 必須為 pooldata_field_option active 紀錄
    await assertProdKindActive(this.optionRepo, input.prodKind);

    const actorName = await this._resolveActorName(actor.userId);
    const now = new Date();

    // BR-1：同 transaction 寫入 ob_card_type + ob_levelcard_version + audit_log
    let savedCardType!: ObCardType;
    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        // 1. INSERT ob_card_type
        const newCard = manager.create(ObCardType, {
          card_type: input.cardType,
          card_name: input.cardName,
          prod_kind: input.prodKind,
          status: 'active',
          created_at: now,
          created_by: actor.userId,
          updated_at: now,
          updated_by: actor.userId,
        });
        savedCardType = await manager.save(newCard);

        // 2. INSERT ob_levelcard_version（BR-3 / BR-7：sdate=今日、edate='20991231'）
        const newVersion = manager.create(ObLevelcardVersion, {
          card_type: input.cardType,
          card_name: input.cardName,
          card_version: 1,
          sdate: sdateToday(),
          edate: '20991231',
          status: 'active',
          created_by: actor.userId,
          created_at: now,
          updated_by: actor.userId,
          updated_at: now,
        } as any);
        await manager.save(newVersion);

        // Test seam：rollback 守護測試攔截點
        await this._afterVersionInsertHook(input.cardType);

        // 3. INSERT assignment_audit_log
        const audit = manager.create(AssignmentAuditLog, {
          entity_type: 'ob_card_type',
          entity_id: input.cardType,
          action: 'CREATE',
          actor_id: actor.userId,
          actor_name: actorName,
          before_value: null,
          after_value: {
            cardType: input.cardType,
            cardName: input.cardName,
            prodKind: input.prodKind,
            status: 'active',
            cardVersion: 1,
          },
          ip_address: actor.ipAddress ?? null,
        });
        await manager.save(audit);
      });
    } catch (err: any) {
      // 既知業務錯誤（如 422 / 409）透傳；其他歸類為 500 並提供原始錯誤訊息
      if (err instanceof UnprocessableEntityException || err instanceof ConflictException) {
        throw err;
      }
      throw new InternalServerErrorException({
        error: 'SYSTEM_INTERNAL_ERROR',
        message: '建立計分卡類型失敗，請稍後再試',
        details: { cardType: input.cardType, cause: err?.message ?? String(err) },
      });
    }

    // v2.1：join prod_kind option 取 label 供 response
    const prodKindRow = await this.optionRepo.findOne({
      where: {
        column_name: 'prod_kind' as any,
        option_value: input.prodKind as any,
      },
    });

    return {
      cardType: savedCardType.card_type,
      cardName: savedCardType.card_name,
      prodKind: savedCardType.prod_kind,
      prodKindName:
        prodKindRow && prodKindRow.is_active ? prodKindRow.option_label ?? null : null,
      status: 'active',
      cardVersion: 1,
      createdAt: now.toISOString(),
    };
  }

  // =========================
  // F071 — PUT /card-types/:cardType
  // =========================

  async updateCardType(
    cardType: string,
    input: UpdateCardTypeInput,
    actor: ActorContext,
  ): Promise<UpdateCardTypeResult> {
    // BR-5：月跑鎖
    await assertNotLocked(this.runRepo, 'card-type-crud');

    // AC-5：cardType 存在性（限定 active）
    const existing = await this.cardTypeRepo.findOne({
      where: { card_type: cardType, status: 'active' },
    });
    if (!existing) {
      throw new NotFoundException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_NOT_FOUND,
        message: `計分卡類型 ${cardType} 不存在`,
      });
    }

    // AC-6 v2.1：prodKind 必須為 pooldata_field_option active 紀錄
    await assertProdKindActive(this.optionRepo, input.prodKind);

    // 保存 before 值（供 audit）
    const before = {
      cardType: existing.card_type,
      cardName: existing.card_name,
      prodKind: existing.prod_kind,
      status: existing.status,
    };

    // AC-3：只更新 card_name / prod_kind；其餘欄位不動
    // BR-4：ob_levelcard_version.card_name 不同步（兩表獨立維護）
    existing.card_name = input.cardName;
    existing.prod_kind = input.prodKind;
    existing.updated_at = new Date();
    existing.updated_by = actor.userId;
    const saved = await this.cardTypeRepo.save(existing);

    const after = {
      cardType: saved.card_type,
      cardName: saved.card_name,
      prodKind: saved.prod_kind,
      status: saved.status,
    };

    await this._writeAudit(
      actor,
      'UPDATE',
      'ob_card_type',
      saved.card_type,
      before,
      after,
    );

    // v2.1：join prod_kind option 取 label
    const prodKindRow = await this.optionRepo.findOne({
      where: {
        column_name: 'prod_kind' as any,
        option_value: saved.prod_kind as any,
      },
    });

    return {
      cardType: saved.card_type,
      cardName: saved.card_name,
      prodKind: saved.prod_kind,
      prodKindName:
        prodKindRow && prodKindRow.is_active ? prodKindRow.option_label ?? null : null,
      status: saved.status as 'active' | 'inactive',
      updatedAt: saved.updated_at.toISOString(),
    };
  }

  // =========================
  // F072 — GET /card-types/:cardType/delete-preview
  // =========================

  async getDeletePreview(cardType: string): Promise<DeletePreviewResult> {
    // AC-7：cardType 存在性檢查（不限 status，preview 階段允許看到 inactive）
    const card = await this.cardTypeRepo.findOne({
      where: { card_type: cardType },
    });
    if (!card) {
      throw new NotFoundException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_NOT_FOUND,
        message: `計分卡類型 ${cardType} 不存在`,
      });
    }

    const cascade = await this._countCascade(cardType);
    const listDefinitionsAffected = await this._countActiveListDefinitions(cardType);

    return {
      cardType: card.card_type,
      cardName: card.card_name,
      cascade,
      listDefinitionsAffected,
    };
  }

  // =========================
  // F072 — DELETE /card-types/:cardType?confirmCascade=true
  // =========================

  async deleteCardTypeCascade(
    cardType: string,
    confirmCascade: boolean | undefined,
    actor: ActorContext,
  ): Promise<DeleteCardTypeResult> {
    // BR-5：缺 confirmCascade=true → 422（先於月跑鎖檢查，與 spec AC-5 一致）
    if (confirmCascade !== true) {
      throw new UnprocessableEntityException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_CASCADE_NOT_CONFIRMED,
        message: CARD_TYPE_ERROR_MESSAGES.CARD_TYPE_CASCADE_NOT_CONFIRMED,
      });
    }

    // BR-7：月跑鎖
    await assertNotLocked(this.runRepo, 'card-type-crud');

    // AC-7：cardType 存在性
    const card = await this.cardTypeRepo.findOne({
      where: { card_type: cardType },
    });
    if (!card) {
      throw new NotFoundException({
        error: CARD_TYPE_ERROR_CODES.CARD_TYPE_NOT_FOUND,
        message: `計分卡類型 ${cardType} 不存在`,
      });
    }

    // 先計 cascade 摘要（供 response + audit before_value）
    const cascade = await this._countCascade(cardType);
    const listDefinitionsAffected = await this._countActiveListDefinitions(cardType);

    const actorName = await this._resolveActorName(actor.userId);
    const now = new Date();

    // BR-6 / AC-3：transaction 6 步驟 hard delete + audit
    await this.dataSource.transaction(async (manager: EntityManager) => {
      // Step 1: ob_tier — 含 fallback (card_level IS NULL) 列；
      //   依 memory feedback_typeorm_null_pk_delete：先 find 後 remove(entity)
      const tierEntities = await manager.find(ObTier, {
        where: { card_type: cardType as any },
      });
      if (tierEntities.length > 0) {
        await manager.remove(tierEntities);
      }

      // Step 2: ob_levelcard_score
      await manager.delete(ObLevelcardScore, { card_type: cardType as any });

      // Step 3: ob_levelcard_level
      await manager.delete(ObLevelcardLevel, { card_type: cardType as any });

      // Step 4: ob_levelcard_column
      await manager.delete(ObLevelcardColumn, { card_type: cardType as any });

      // Step 5: ob_levelcard_version
      await manager.delete(ObLevelcardVersion, { card_type: cardType as any });

      // Step 6: ob_card_type
      await manager.delete(ObCardType, { card_type: cardType as any });

      // Step 7 (BR-8)：audit_log 同 tx 寫入
      const audit = manager.create(AssignmentAuditLog, {
        entity_type: 'ob_card_type',
        entity_id: cardType,
        action: 'DELETE',
        actor_id: actor.userId,
        actor_name: actorName,
        before_value: {
          cardType: card.card_type,
          cardName: card.card_name,
          cascade,
          listDefinitionsAffected,
        },
        after_value: null,
        ip_address: actor.ipAddress ?? null,
      });
      await manager.save(audit);
    });

    return {
      cardType,
      deletedCascade: cascade,
      listDefinitionsAffected,
      deletedAt: now.toISOString(),
    };
  }

  // =========================
  // Helpers
  // =========================

  private async _countCascade(cardType: string): Promise<CascadeCountSummary> {
    const [versions, columns, scores, levels, tierMappings] = await Promise.all([
      this.versionRepo.count({ where: { card_type: cardType as any } }),
      this.columnRepo.count({ where: { card_type: cardType as any } }),
      this.scoreRepo.count({ where: { card_type: cardType as any } }),
      this.levelRepo.count({ where: { card_type: cardType as any } }),
      this.tierRepo.count({ where: { card_type: cardType as any } }),
    ]);

    return { versions, columns, scores, levels, tierMappings };
  }

  private async _countActiveListDefinitions(cardType: string): Promise<number> {
    // F072 BR-4：ob_list_definition WHERE card_type = :ct AND status = 'active'
    // entity ob-list-definition.entity.ts 已宣告 card_type / status 兩欄位。
    return this.listDefRepo.count({
      where: {
        card_type: cardType as any,
        status: 'active',
      },
    });
  }

  private async _writeAudit(
    actor: ActorContext,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: string,
    entityId: string,
    beforeValue: Record<string, unknown> | null,
    afterValue: Record<string, unknown> | null,
  ): Promise<void> {
    const actorName = await this._resolveActorName(actor.userId);
    const log = this.auditRepo.create({
      entity_type: entityType,
      entity_id: entityId,
      action: action as 'CREATE' | 'UPDATE' | 'DELETE',
      actor_id: actor.userId,
      actor_name: actorName,
      before_value: beforeValue,
      after_value: afterValue,
      ip_address: actor.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  private async _resolveActorName(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name ?? 'unknown';
  }

  // 兩個型別在外部需用到（避免循環依賴）
  public readonly _AssignmentLockKind?: AssignmentLockKind;
}
