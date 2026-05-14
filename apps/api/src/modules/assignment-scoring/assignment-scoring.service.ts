import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

/**
 * F053 / F054 / F055 / F056：E07 計分卡設定 Service
 *
 * 範圍：計分維度（ob_levelcard_column / score）、CARD_LEVEL 門檻（ob_levelcard_level）、
 * TIER_LEVEL 對應（ob_tier）查詢與覆寫式編輯。
 *
 * 商業規則摘要：
 *   - 覆寫式設計（無草稿、無 rollback；歷史靠月跑 snapshot）
 *   - 寫入前檢查月跑鎖：`assignment_run.status IN ('pending','running')` → 409 SCORING_VERSION_LOCKED
 *   - 寫入後寫 assignment_audit_log（actor_id=req.user.userId）
 *   - F056 fallback：CARD_LEVEL=NULL 表示「不分等級」的對應規則（M5/M3/HC/C3）
 */

// =========================
// Error codes
// =========================
export const SCORING_ERROR_CODES = {
  SCORING_VERSION_NOT_FOUND: 'SCORING_VERSION_NOT_FOUND',
  SCORING_COLUMN_NOT_FOUND: 'SCORING_COLUMN_NOT_FOUND',
  SCORING_VERSION_LOCKED: 'SCORING_VERSION_LOCKED',
  SCORING_COLUMN_DUPLICATE: 'SCORING_COLUMN_DUPLICATE',
  SCORING_RANGE_OVERLAP: 'SCORING_RANGE_OVERLAP',
  TIER_LEVEL_DUPLICATE: 'TIER_LEVEL_DUPLICATE',
  // v1.3 / v1.4 錯誤碼拆分（PO 2026-05-14）：
  //   舊 CARD_LEVEL_NOT_FOUND 一碼多用，於本版拆分為三：
  //   - CARD_LEVEL_NOT_FOUND_IN_VERSION（422）：F056 PUT/POST 驗證，cardLevel 不存在於 active 版本
  //   - CARD_LEVEL_RECORD_NOT_FOUND   （404）：F055 PUT/DELETE 操作時複合 PK 紀錄不存在
  //   - CARD_LEVEL_REFERENCED         （409）：F055 DELETE cascade reference check（ob_tier 仍引用）
  CARD_LEVEL_NOT_FOUND_IN_VERSION: 'CARD_LEVEL_NOT_FOUND_IN_VERSION',
  CARD_LEVEL_RECORD_NOT_FOUND: 'CARD_LEVEL_RECORD_NOT_FOUND',
  CARD_LEVEL_REFERENCED: 'CARD_LEVEL_REFERENCED',
  TIER_MAPPING_NOT_FOUND: 'TIER_MAPPING_NOT_FOUND',
} as const;

export const SCORING_ERROR_MESSAGES = {
  SCORING_VERSION_NOT_FOUND: '目前無生效的計分版本，請聯繫 IT 確認設定',
  SCORING_COLUMN_NOT_FOUND: '指定的計分維度不存在或已停用',
  SCORING_VERSION_LOCKED: '分派執行中，無法修改計分設定',
  SCORING_COLUMN_DUPLICATE: '計分維度 column_name 已存在於 active 版本',
  SCORING_RANGE_OVERLAP: '分數區間重疊，請調整條件值',
  TIER_LEVEL_DUPLICATE: 'TIER 對應已存在',
  CARD_LEVEL_NOT_FOUND_IN_VERSION: '指定的 CARD_LEVEL 不存在於 active 計分版本',
  CARD_LEVEL_RECORD_NOT_FOUND: '指定的 CARD_LEVEL 紀錄不存在',
  CARD_LEVEL_REFERENCED:
    '此 CARD_LEVEL 仍被 TIER_LEVEL 對應引用，請先於 F056 移除對應後再刪除',
  TIER_MAPPING_NOT_FOUND: '指定的 TIER 對應不存在',
} as const;

// =========================
// DTO / Result types
// =========================
export interface ActorContext {
  userId: string;
  ipAddress?: string | null;
}

export interface ScoringScoreItem {
  level1: string | null;
  level2S: string | null;
  level2E: string | null;
  score: number;
}

export interface ScoringDimensionItem {
  columnName: string;
  columnLabel: string;
  scoreSummary: string;
  scores: ScoringScoreItem[];
}

export interface ScoringVersionInfo {
  cardType: string;
  cardName: string | null;
  cardVersion: number;
  sdate: string;
  edate: string;
  createdBy: string | null;
  createdAt: string | null;
}

export interface GetScoringResult {
  version: ScoringVersionInfo;
  dimensions: ScoringDimensionItem[];
}

// =========================
// F054 types
// =========================
export interface DimensionUpdateInput {
  columnName: string;
  columnLabel: string;
  scores: Array<{
    level1?: string | null;
    level2S?: string | null;
    level2E?: string | null;
    score: number;
  }>;
}

export interface UpdateDimensionsInput {
  cardType: string;
  cardVersion: number;
  dimensions: DimensionUpdateInput[];
}

export interface UpdateDimensionsResult {
  cardType: string;
  cardVersion: number;
  updatedDimensions: number;
  updatedScores: number;
}

export interface CreateDimensionInput {
  cardType: string;
  cardVersion: number;
  columnName: string;
  columnLabel: string;
  scores: Array<{
    level1?: string | null;
    level2S?: string | null;
    level2E?: string | null;
    score: number;
  }>;
}

export interface CreateDimensionResult {
  cardType: string;
  cardVersion: number;
  columnName: string;
  columnLabel: string;
  status: 'active';
  scoresCount: number;
}

export interface DisableDimensionResult {
  cardType: string;
  cardVersion: number;
  columnName: string;
  status: 'inactive';
  disabledAt: string;
}

// =========================
// F055 types
// =========================
export interface CardLevelItem {
  cardLevel: string;
  scoreS: number;
  scoreE: number;
}

export interface UpdateCardLevelsInput {
  cardType: string;
  cardVersion: number;
  levels: CardLevelItem[];
}

export interface UpdateCardLevelsResult {
  cardType: string;
  cardVersion: number;
  updatedLevels: number;
}

export interface GetCardLevelsInput {
  cardType: string;
  cardVersion?: number;
}

export interface GetCardLevelsResult {
  cardType: string;
  cardVersion: number;
  levels: CardLevelItem[];
}

export interface PreviewCardLevelsInput {
  cardType: string;
  /** URL-decoded JSON 字串，service 內 parse */
  levels: string;
}

export interface PreviewCardLevelsResult {
  distribution: Record<string, number>;
}

// F055 §5.3 DELETE
export interface DeleteCardLevelInput {
  cardType: string;
  cardVersion: number;
  cardLevel: string;
}

export interface DeleteCardLevelResult {
  cardType: string;
  cardVersion: number;
  cardLevel: string;
  deletedAt: string;
}

// =========================
// F056 types
// =========================
export interface TierMappingItem {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm?: string | null;
}

export interface GetTierMappingResult {
  mappings: Array<{
    cardType: string;
    cardLevel: string | null;
    tierLevel: string;
    listNm: string | null;
  }>;
}

export interface UpdateTierMappingInput {
  mappings: TierMappingItem[];
}

export interface UpdateTierMappingResult {
  updatedCount: number;
  insertedCount: number;
}

export interface CreateTierMappingInput {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm?: string | null;
}

export interface CreateTierMappingResult {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm: string | null;
}

// F056 §5.4 DELETE
export interface DeleteTierMappingInput {
  cardType: string;
  cardLevel: string | null; // null = fallback 規則紀錄
}

export interface DeleteTierMappingResult {
  cardType: string;
  cardLevel: string | null;
  deletedAt: string;
}

@Injectable()
export class AssignmentScoringService {
  constructor(
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
    @InjectRepository(ObPoolDataList)
    private readonly poolDataListRepo: Repository<ObPoolDataList>,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // =========================
  // F053 — GET /scoring
  // =========================

  async getScoring(query: { cardType?: string }): Promise<GetScoringResult> {
    const cardType = query.cardType;
    const version = await this.versionRepo.findOne({
      where: { card_type: cardType as any, status: 'active' as any },
    });
    if (!version) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.SCORING_VERSION_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.SCORING_VERSION_NOT_FOUND,
      });
    }

    const cardVersion = version.card_version ?? 1;

    const columns = await this.columnRepo.find({
      where: {
        card_type: cardType as any,
        card_version: cardVersion as any,
        status: 'active' as any,
      },
    });

    const scores = await this.scoreRepo.find({
      where: { card_type: cardType as any, card_version: cardVersion as any },
    });

    // 依 column_name 升冪排序維度
    const sortedColumns = [...columns].sort((a, b) =>
      (a.column_name ?? '').localeCompare(b.column_name ?? ''),
    );

    const dimensions: ScoringDimensionItem[] = sortedColumns.map((col) => {
      const colScores = scores.filter((s) => s.column_name === col.column_name);
      return {
        columnName: col.column_name ?? '',
        columnLabel: col.column_label ?? '',
        scoreSummary: `${colScores.length} 個區間`,
        scores: colScores.map((s) => ({
          level1: s.level1,
          level2S: s.level2_s,
          level2E: s.level2_e,
          score: s.score,
        })),
      };
    });

    return {
      version: {
        cardType: version.card_type ?? '',
        cardName: version.card_name,
        cardVersion: cardVersion,
        sdate: version.sdate,
        edate: version.edate,
        createdBy: version.created_by,
        createdAt: version.created_at
          ? new Date(version.created_at).toISOString()
          : null,
      },
      dimensions,
    };
  }

  // =========================
  // F054 — PUT /scoring/dimensions（覆寫式編輯）
  // =========================

  async updateDimensions(
    input: UpdateDimensionsInput,
    actor: ActorContext,
  ): Promise<UpdateDimensionsResult> {
    // BR-4：月跑鎖
    await this.assertNotLocked();

    // AC-6 / BR-3：先驗證每個維度的數值區間（在 body 內）不重疊
    for (const dim of input.dimensions) {
      const numericScores = dim.scores.filter(
        (s) => s.level2S != null && s.level2E != null,
      );
      const hasOverlap = AssignmentScoringService.hasStringIntervalOverlap(
        numericScores.map((s) => ({
          level2S: s.level2S ?? null,
          level2E: s.level2E ?? null,
        })),
      );
      if (hasOverlap) {
        throw new UnprocessableEntityException({
          error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
          message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
        });
      }
    }

    let updatedDimensions = 0;
    let updatedScores = 0;

    for (const dim of input.dimensions) {
      const column = await this.columnRepo.findOne({
        where: {
          card_type: input.cardType as any,
          card_version: input.cardVersion as any,
          column_name: dim.columnName as any,
        },
      });
      if (!column) {
        throw new NotFoundException({
          error: SCORING_ERROR_CODES.SCORING_COLUMN_NOT_FOUND,
          message: SCORING_ERROR_MESSAGES.SCORING_COLUMN_NOT_FOUND,
        });
      }

      // 讀舊 scores（供 audit before_value）
      const oldScores = await this.scoreRepo.find({
        where: {
          card_type: input.cardType as any,
          card_version: input.cardVersion as any,
          column_name: dim.columnName as any,
        },
      });

      const beforeSnapshot = {
        columnLabel: column.column_label,
        scores: oldScores.map((s) => ({
          level1: s.level1,
          level2S: s.level2_s,
          level2E: s.level2_e,
          score: s.score,
        })),
      };

      // 覆寫式：刪舊 → 寫新
      await this.scoreRepo.delete({
        card_type: input.cardType as any,
        card_version: input.cardVersion as any,
        column_name: dim.columnName as any,
      });

      const newRows = dim.scores.map((s) =>
        this.scoreRepo.create({
          card_type: input.cardType,
          card_version: input.cardVersion,
          column_name: dim.columnName,
          level1: s.level1 ?? null,
          level2_s: s.level2S ?? null,
          level2_e: s.level2E ?? null,
          score: s.score,
        } as any),
      );

      if (newRows.length > 0) {
        await this.scoreRepo.save(newRows as any);
      }

      // 更新 columnLabel（如有變更）
      if (column.column_label !== dim.columnLabel) {
        column.column_label = dim.columnLabel;
        await this.columnRepo.save(column);
      }

      const afterSnapshot = {
        columnLabel: dim.columnLabel,
        scores: dim.scores.map((s) => ({
          level1: s.level1 ?? null,
          level2S: s.level2S ?? null,
          level2E: s.level2E ?? null,
          score: s.score,
        })),
      };

      await this.writeAudit(
        actor,
        'UPDATE',
        'ob_levelcard_score',
        `${input.cardType}|${input.cardVersion}|${dim.columnName}`,
        beforeSnapshot,
        afterSnapshot,
      );

      updatedDimensions += 1;
      updatedScores += dim.scores.length;
    }

    return {
      cardType: input.cardType,
      cardVersion: input.cardVersion,
      updatedDimensions,
      updatedScores,
    };
  }

  // =========================
  // F054 — POST /scoring/dimensions（新增維度）
  // =========================

  async createDimension(
    input: CreateDimensionInput,
    actor: ActorContext,
  ): Promise<CreateDimensionResult> {
    await this.assertNotLocked();

    // AC-6：body 內 scores 區間重疊驗證（先做，避免在 duplicate 之後又驗證）
    const numericScores = input.scores.filter(
      (s) => s.level2S != null && s.level2E != null,
    );
    if (
      AssignmentScoringService.hasStringIntervalOverlap(
        numericScores.map((s) => ({
          level2S: s.level2S ?? null,
          level2E: s.level2E ?? null,
        })),
      )
    ) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
        message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
      });
    }

    // TS-F054-006：column_name 已存在於 active 版本 → 422 SCORING_COLUMN_DUPLICATE
    const existing = await this.columnRepo.findOne({
      where: {
        card_type: input.cardType as any,
        card_version: input.cardVersion as any,
        column_name: input.columnName as any,
        status: 'active' as any,
      },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.SCORING_COLUMN_DUPLICATE,
        message: SCORING_ERROR_MESSAGES.SCORING_COLUMN_DUPLICATE,
      });
    }

    // 寫入 column
    const newColumn = this.columnRepo.create({
      card_type: input.cardType,
      card_version: input.cardVersion,
      column_name: input.columnName,
      column_label: input.columnLabel,
      status: 'active',
    } as any);
    await this.columnRepo.save(newColumn);

    // 寫入 scores
    if (input.scores.length > 0) {
      const rows = input.scores.map((s) =>
        this.scoreRepo.create({
          card_type: input.cardType,
          card_version: input.cardVersion,
          column_name: input.columnName,
          level1: s.level1 ?? null,
          level2_s: s.level2S ?? null,
          level2_e: s.level2E ?? null,
          score: s.score,
        } as any),
      );
      await this.scoreRepo.save(rows as any);
    }

    // audit_log
    await this.writeAudit(
      actor,
      'CREATE',
      'ob_levelcard_column',
      `${input.cardType}|${input.cardVersion}|${input.columnName}`,
      null,
      {
        columnName: input.columnName,
        columnLabel: input.columnLabel,
        scores: input.scores.map((s) => ({
          level1: s.level1 ?? null,
          level2S: s.level2S ?? null,
          level2E: s.level2E ?? null,
          score: s.score,
        })),
      },
    );

    return {
      cardType: input.cardType,
      cardVersion: input.cardVersion,
      columnName: input.columnName,
      columnLabel: input.columnLabel,
      status: 'active',
      scoresCount: input.scores.length,
    };
  }

  // =========================
  // F054 — PUT /scoring/dimensions/:columnName/disable（軟刪除）
  // =========================

  async disableDimension(
    cardType: string,
    columnName: string,
    actor: ActorContext,
  ): Promise<DisableDimensionResult> {
    await this.assertNotLocked();

    // findOne 限定 status='active'，已停用的不再允許重複停用 → 404
    const existing = await this.columnRepo.findOne({
      where: {
        card_type: cardType as any,
        column_name: columnName as any,
        status: 'active' as any,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.SCORING_COLUMN_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.SCORING_COLUMN_NOT_FOUND,
      });
    }

    const before = { status: 'active' as const };

    existing.status = 'inactive';
    await this.columnRepo.save(existing);

    const after = { status: 'inactive' as const };

    const cardVersion = existing.card_version ?? 1;

    await this.writeAudit(
      actor,
      'DISABLE',
      'ob_levelcard_column',
      `${cardType}|${cardVersion}|${columnName}`,
      before,
      after,
    );

    return {
      cardType,
      cardVersion,
      columnName,
      status: 'inactive',
      disabledAt: new Date().toISOString(),
    };
  }

  // =========================
  // F055 — GET /scoring/card-levels（§5.1.1，列表）
  // =========================

  async getCardLevels(input: GetCardLevelsInput): Promise<GetCardLevelsResult> {
    // cardVersion 未傳 → 取 active 版本；顯式傳入 → 用該版本（不限 status）
    const whereClause: any = {
      card_type: input.cardType as any,
    };
    if (input.cardVersion !== undefined) {
      whereClause.card_version = input.cardVersion;
    } else {
      whereClause.status = 'active' as any;
    }

    const version = await this.versionRepo.findOne({ where: whereClause });
    if (!version) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.SCORING_VERSION_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.SCORING_VERSION_NOT_FOUND,
      });
    }
    const cardVersion = version.card_version ?? input.cardVersion ?? 1;

    const rows = await this.levelRepo.find({
      where: {
        card_type: input.cardType as any,
        card_version: cardVersion as any,
      },
    });

    // F055 §5.1.1：依 score_s 降冪（A 級門檻最高）
    const sorted = [...rows].sort((a, b) => b.score_s - a.score_s);

    return {
      cardType: input.cardType,
      cardVersion,
      levels: sorted.map((r) => ({
        cardLevel: r.card_level,
        scoreS: r.score_s,
        scoreE: r.score_e,
      })),
    };
  }

  // =========================
  // F055 — GET /scoring/card-levels/preview（§5.2）
  // =========================

  async previewCardLevels(
    input: PreviewCardLevelsInput,
  ): Promise<PreviewCardLevelsResult> {
    // 解析 levels JSON
    let parsedLevels: CardLevelItem[];
    try {
      parsedLevels = JSON.parse(input.levels);
      if (!Array.isArray(parsedLevels)) {
        throw new Error('levels must be an array');
      }
    } catch (err) {
      throw new UnprocessableEntityException({
        error: 'VALIDATION_ERROR',
        message: 'levels 參數格式錯誤，需為 JSON 陣列',
      });
    }

    // 載入 pool_data_list 之 H 型 score（套用新門檻試算分佈）
    // 註：F055 §5.2 / risk-1：preview 以既有 score 套用新門檻，非重新呼叫 fn_calc_tier_level
    const poolRows = await this.poolDataListRepo.find();

    const distribution: Record<string, number> = {};
    for (const l of parsedLevels) {
      distribution[l.cardLevel] = 0;
    }

    for (const row of poolRows) {
      const rawScore = (row as any).score;
      const numericScore =
        typeof rawScore === 'number' ? rawScore : Number(rawScore);
      if (!Number.isFinite(numericScore)) continue;
      for (const l of parsedLevels) {
        if (numericScore >= l.scoreS && numericScore <= l.scoreE) {
          distribution[l.cardLevel] = (distribution[l.cardLevel] ?? 0) + 1;
          break;
        }
      }
    }

    return { distribution };
  }

  // =========================
  // F055 — PUT /scoring/card-levels（partial update）
  // =========================

  async updateCardLevels(
    input: UpdateCardLevelsInput,
    actor: ActorContext,
  ): Promise<UpdateCardLevelsResult> {
    await this.assertNotLocked();

    // 區間驗證
    for (const l of input.levels) {
      if (l.scoreS > l.scoreE) {
        throw new UnprocessableEntityException({
          error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
          message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
        });
      }
    }
    const overlap = AssignmentScoringService.hasNumericOverlap(
      input.levels.map((l) => ({ scoreS: l.scoreS, scoreE: l.scoreE })),
    );
    if (overlap) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
        message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
      });
    }

    // 依三欄複合鍵定位 + UPDATE
    const beforeAll: CardLevelItem[] = [];
    const afterAll: CardLevelItem[] = [];

    for (const l of input.levels) {
      const existing = await this.levelRepo.findOne({
        where: {
          card_type: input.cardType as any,
          card_version: input.cardVersion as any,
          card_level: l.cardLevel as any,
        },
      });
      if (!existing) {
        // F055 PUT 複合 PK 紀錄不存在 → 404 CARD_LEVEL_RECORD_NOT_FOUND
        // （與 F056 PUT/POST 422 CARD_LEVEL_NOT_FOUND_IN_VERSION 區分）
        throw new NotFoundException({
          error: SCORING_ERROR_CODES.CARD_LEVEL_RECORD_NOT_FOUND,
          message: SCORING_ERROR_MESSAGES.CARD_LEVEL_RECORD_NOT_FOUND,
        });
      }
      beforeAll.push({
        cardLevel: existing.card_level,
        scoreS: existing.score_s,
        scoreE: existing.score_e,
      });

      existing.score_s = l.scoreS;
      existing.score_e = l.scoreE;
      await this.levelRepo.save(existing);

      afterAll.push({ cardLevel: l.cardLevel, scoreS: l.scoreS, scoreE: l.scoreE });
    }

    await this.writeAudit(
      actor,
      'UPDATE',
      'ob_levelcard_level',
      `${input.cardType}|${input.cardVersion}`,
      { levels: beforeAll },
      { levels: afterAll },
    );

    return {
      cardType: input.cardType,
      cardVersion: input.cardVersion,
      updatedLevels: input.levels.length,
    };
  }

  // =========================
  // F055 — DELETE /scoring/card-levels（§5.3，hard delete + cascade reference check）
  // =========================
  //
  // 對應 spec：F055 v1.3 §5.3 / AC-6 / AC-7 / BR-5 / BR-6
  //   1. 月跑鎖（BR-3）：assignment_run pending/running → 409 SCORING_VERSION_LOCKED
  //   2. 複合 PK 紀錄存在性檢查：不存在 → 404 CARD_LEVEL_RECORD_NOT_FOUND
  //   3. cascade reference check（BR-6）：ob_tier 仍引用 (cardType, cardLevel) → 409 CARD_LEVEL_REFERENCED
  //      - fallback 對應（card_level IS NULL）不算引用，因 NULL 與本表的具體 cardLevel 字串不同
  //   4. hard delete（BR-5）：直接從 ob_levelcard_level 移除紀錄
  //   5. audit log：action='DELETE', entity_id='{cardType}|{cardVersion}|{cardLevel}',
  //                  before_value 含 scoreS/scoreE，after_value=null

  async deleteCardLevel(
    input: DeleteCardLevelInput,
    actor: ActorContext,
  ): Promise<DeleteCardLevelResult> {
    await this.assertNotLocked();

    const existing = await this.levelRepo.findOne({
      where: {
        card_type: input.cardType as any,
        card_version: input.cardVersion as any,
        card_level: input.cardLevel as any,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_RECORD_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.CARD_LEVEL_RECORD_NOT_FOUND,
      });
    }

    // BR-6 cascade reference check：ob_tier 仍有 (cardType, cardLevel) 對應 → 拒絕刪除
    // 注意：fallback 紀錄 card_level IS NULL 不會與本表的非 NULL cardLevel 比對相等，
    // 因此這裡用 find()+filter 而非 SQL `=` 比對，與 service 內 findTierByPk 同樣處理方式。
    const referencingTiers = await this.tierRepo.find({
      where: { card_type: input.cardType as any },
    });
    const referenced = referencingTiers.some(
      (t) => t.card_level === input.cardLevel,
    );
    if (referenced) {
      throw new ConflictException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_REFERENCED,
        message: SCORING_ERROR_MESSAGES.CARD_LEVEL_REFERENCED,
      });
    }

    const before = {
      cardLevel: existing.card_level,
      scoreS: existing.score_s,
      scoreE: existing.score_e,
    };

    // BR-5 hard delete
    await this.levelRepo.delete({
      card_type: input.cardType as any,
      card_version: input.cardVersion as any,
      card_level: input.cardLevel as any,
    });

    await this.writeAudit(
      actor,
      'DELETE',
      'ob_levelcard_level',
      `${input.cardType}|${input.cardVersion}|${input.cardLevel}`,
      before,
      null,
    );

    return {
      cardType: input.cardType,
      cardVersion: input.cardVersion,
      cardLevel: input.cardLevel,
      deletedAt: new Date().toISOString(),
    };
  }

  // =========================
  // F056 — GET /scoring/tier-mapping（§5.1）
  // =========================

  async getTierMapping(): Promise<GetTierMappingResult> {
    const rows = await this.tierRepo.find();

    // 依 (card_type, card_level NULLS LAST) 升冪
    const sorted = [...rows].sort((a, b) => {
      if (a.card_type !== b.card_type) {
        return a.card_type.localeCompare(b.card_type);
      }
      const aNull = a.card_level == null;
      const bNull = b.card_level == null;
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      if (aNull && bNull) return 0;
      return (a.card_level ?? '').localeCompare(b.card_level ?? '');
    });

    return {
      mappings: sorted.map((r) => ({
        cardType: r.card_type,
        cardLevel: r.card_level,
        tierLevel: r.tier_level,
        listNm: r.list_nm,
      })),
    };
  }

  // =========================
  // F056 — PUT /scoring/tier-mapping（§5.2，批次 UPSERT）
  // =========================

  async updateTierMapping(
    input: UpdateTierMappingInput,
    actor: ActorContext,
  ): Promise<UpdateTierMappingResult> {
    await this.assertNotLocked();

    // BR-1 / spec 5.2：body 內 (cardType, cardLevel) 重複 → 422 TIER_LEVEL_DUPLICATE
    const pkSet = new Set<string>();
    for (const m of input.mappings) {
      const pk = `${m.cardType}|${m.cardLevel ?? '_null'}`;
      if (pkSet.has(pk)) {
        throw new UnprocessableEntityException({
          error: SCORING_ERROR_CODES.TIER_LEVEL_DUPLICATE,
          message: SCORING_ERROR_MESSAGES.TIER_LEVEL_DUPLICATE,
        });
      }
      pkSet.add(pk);
    }

    // BR-3：CARD_LEVEL 非 NULL 時必須存在於 active 版本
    for (const m of input.mappings) {
      await this.assertCardLevelExistsOrFallback(m.cardType, m.cardLevel);
    }

    let updatedCount = 0;
    let insertedCount = 0;

    for (const m of input.mappings) {
      const existing = await this.findTierByPk(m.cardType, m.cardLevel);

      const before = existing
        ? {
            cardType: existing.card_type,
            cardLevel: existing.card_level,
            tierLevel: existing.tier_level,
            listNm: existing.list_nm,
          }
        : null;

      let savedListNm: string | null;
      if (existing) {
        existing.tier_level = m.tierLevel;
        if (m.listNm !== undefined) {
          existing.list_nm = m.listNm ?? null;
        }
        savedListNm = existing.list_nm;
        await this.tierRepo.save(existing);
        updatedCount += 1;
      } else {
        const newRow = this.tierRepo.create({
          card_type: m.cardType,
          card_level: m.cardLevel,
          tier_level: m.tierLevel,
          list_nm: m.listNm ?? null,
        } as any);
        savedListNm = m.listNm ?? null;
        await this.tierRepo.save(newRow);
        insertedCount += 1;
      }

      const after = {
        cardType: m.cardType,
        cardLevel: m.cardLevel,
        tierLevel: m.tierLevel,
        listNm: savedListNm,
      };

      await this.writeAudit(
        actor,
        existing ? 'UPDATE' : 'CREATE',
        'ob_tier',
        `${m.cardType}|${m.cardLevel ?? ''}`,
        before,
        after,
      );
    }

    return { updatedCount, insertedCount };
  }

  // =========================
  // F056 — POST /scoring/tier-mapping（§5.3，單筆 INSERT）
  // =========================

  async createTierMapping(
    input: CreateTierMappingInput,
    actor: ActorContext,
  ): Promise<CreateTierMappingResult> {
    await this.assertNotLocked();

    // BR-3 / BR-9：CARD_LEVEL 非 NULL 時必須存在於 active 版本；>1 字元視同不存在
    await this.assertCardLevelExistsOrFallback(input.cardType, input.cardLevel);

    const existing = await this.findTierByPk(input.cardType, input.cardLevel);
    if (existing) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.TIER_LEVEL_DUPLICATE,
        message: SCORING_ERROR_MESSAGES.TIER_LEVEL_DUPLICATE,
      });
    }

    const newRow = this.tierRepo.create({
      card_type: input.cardType,
      card_level: input.cardLevel,
      tier_level: input.tierLevel,
      list_nm: input.listNm ?? null,
    } as any);
    await this.tierRepo.save(newRow);

    await this.writeAudit(
      actor,
      'CREATE',
      'ob_tier',
      `${input.cardType}|${input.cardLevel ?? ''}`,
      null,
      {
        cardType: input.cardType,
        cardLevel: input.cardLevel,
        tierLevel: input.tierLevel,
        listNm: input.listNm ?? null,
      },
    );

    return {
      cardType: input.cardType,
      cardLevel: input.cardLevel,
      tierLevel: input.tierLevel,
      listNm: input.listNm ?? null,
    };
  }

  // =========================
  // F056 — DELETE /scoring/tier-mapping（§5.4，hard delete）
  // =========================
  //
  // 對應 spec：F056 v1.4 §5.4 / AC-6 / AC-7 / BR-11
  //   1. 月跑鎖（BR-5）：assignment_run pending/running → 409 SCORING_VERSION_LOCKED
  //   2. 對應紀錄存在性檢查：不存在（含 fallback NULL）→ 404 TIER_MAPPING_NOT_FOUND
  //   3. hard delete（BR-11）：直接從 ob_tier 移除紀錄
  //   4. audit log：action='DELETE', entity_type='ob_tier',
  //                  entity_id='{cardType}|{cardLevel ?? ""}'（fallback cardLevel 留空）,
  //                  before_value 含 tierLevel，after_value=null

  async deleteTierMapping(
    input: DeleteTierMappingInput,
    actor: ActorContext,
  ): Promise<DeleteTierMappingResult> {
    await this.assertNotLocked();

    const existing = await this.findTierByPk(input.cardType, input.cardLevel);
    if (!existing) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.TIER_MAPPING_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.TIER_MAPPING_NOT_FOUND,
      });
    }

    const before = {
      cardType: existing.card_type,
      cardLevel: existing.card_level,
      tierLevel: existing.tier_level,
      listNm: existing.list_nm,
    };

    // BR-11 hard delete
    // 用 remove(entity) 而非 delete({...PK...})：避免在 SQLite 上對 card_level=null 的條件
    // 退化為 SQL `card_level = NULL` 而無法 match（與既有 findTierByPk 處理方式對稱）。
    await this.tierRepo.remove(existing);

    await this.writeAudit(
      actor,
      'DELETE',
      'ob_tier',
      `${input.cardType}|${input.cardLevel ?? ''}`,
      before,
      null,
    );

    return {
      cardType: input.cardType,
      cardLevel: input.cardLevel,
      deletedAt: new Date().toISOString(),
    };
  }

  // ----- F056 helpers -----

  /**
   * fallback 場景（card_level === null）跳過驗證；
   * 其他需確認該 cardLevel 存在於 active 版本對應 ob_levelcard_level。
   * BR-9：card_level 超過 1 字元視同不存在 → CARD_LEVEL_NOT_FOUND_IN_VERSION
   *   （VARCHAR(1) vs VARCHAR(5) 長度不對稱保護）。
   *
   * v1.4：原 CARD_LEVEL_NOT_FOUND 重新命名為 CARD_LEVEL_NOT_FOUND_IN_VERSION，
   * 與 F055 DELETE 404 CARD_LEVEL_RECORD_NOT_FOUND 區分。
   */
  private async assertCardLevelExistsOrFallback(
    cardType: string,
    cardLevel: string | null,
  ): Promise<void> {
    if (cardLevel == null) return; // fallback 跳過

    if (cardLevel.length > 1) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
        message: SCORING_ERROR_MESSAGES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
      });
    }

    const version = await this.versionRepo.findOne({
      where: { card_type: cardType as any, status: 'active' as any },
    });
    const cardVersion = version?.card_version ?? null;
    if (cardVersion == null) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
        message: SCORING_ERROR_MESSAGES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
      });
    }
    const level = await this.levelRepo.findOne({
      where: {
        card_type: cardType as any,
        card_version: cardVersion as any,
        card_level: cardLevel as any,
      },
    });
    if (!level) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
        message: SCORING_ERROR_MESSAGES.CARD_LEVEL_NOT_FOUND_IN_VERSION,
      });
    }
  }

  /**
   * 以 (card_type, card_level) PK 查 ob_tier。
   * card_level NULL 需在記憶體內過濾（避免 TypeORM 將 null 轉成 =NULL 在 SQL 無法 match）。
   */
  private async findTierByPk(
    cardType: string,
    cardLevel: string | null,
  ): Promise<ObTier | null> {
    if (cardLevel === null) {
      const all = await this.tierRepo.find({
        where: { card_type: cardType as any },
      });
      return all.find((r) => r.card_level == null) ?? null;
    }
    return this.tierRepo.findOne({
      where: {
        card_type: cardType as any,
        card_level: cardLevel as any,
      },
    });
  }

  // =========================
  // 共用：月跑鎖 / audit log
  // =========================

  /**
   * 檢查月跑鎖（pending/running 期間禁止修改）。
   * 觸發時拋 409 SCORING_VERSION_LOCKED。
   */
  protected async assertNotLocked(): Promise<void> {
    const locked = await this.runRepo.findOne({
      where: { status: In(['pending', 'running']) as any },
    });
    if (locked) {
      throw new ConflictException({
        error: SCORING_ERROR_CODES.SCORING_VERSION_LOCKED,
        message: SCORING_ERROR_MESSAGES.SCORING_VERSION_LOCKED,
      });
    }
  }

  protected async writeAudit(
    actor: ActorContext,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISABLE',
    entityType: string,
    entityId: string,
    beforeValue: Record<string, unknown> | null,
    afterValue: Record<string, unknown> | null,
  ): Promise<void> {
    const actorName = await this.resolveActorName(actor.userId);
    const log = this.auditRepo.create({
      entity_type: entityType,
      entity_id: entityId,
      // assignment_audit_log.action enum 為 CREATE/UPDATE/DELETE/RUN，
      // 沿用 F068 cast pattern 允許 DISABLE 寫入（DB schema varchar(10) 容許）
      action: action as 'CREATE' | 'UPDATE' | 'DELETE',
      actor_id: actor.userId,
      actor_name: actorName,
      before_value: beforeValue,
      after_value: afterValue,
      ip_address: actor.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  protected async resolveActorName(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name ?? 'unknown';
  }

  // =========================
  // 純函式 helpers（exported for testing）
  // =========================

  /**
   * 驗證數值區間不重疊（半開區間 BR-1：相鄰允許，score_e + 1 = 下一級 score_s）。
   * 入參：陣列 of {scoreS, scoreE}（數值）。
   * 回傳：true 表示有重疊；false 表示合法。
   */
  static hasNumericOverlap(
    intervals: ReadonlyArray<{ scoreS: number; scoreE: number }>,
  ): boolean {
    const sorted = [...intervals].sort((a, b) => a.scoreS - b.scoreS);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      // 接觸不重疊（prev.scoreE + 1 == cur.scoreS）為合法
      if (cur.scoreS <= prev.scoreE) return true;
    }
    return false;
  }

  /**
   * 驗證 level2_s / level2_e 字串型區間是否與既有區間重疊（F054 用）。
   * 字串轉數字比較；任一邊無法轉數字則略過該區間。
   */
  static hasStringIntervalOverlap(
    intervals: ReadonlyArray<{ level2S: string | null; level2E: string | null }>,
  ): boolean {
    const numeric: { scoreS: number; scoreE: number }[] = [];
    for (const it of intervals) {
      if (it.level2S == null || it.level2E == null) continue;
      const s = Number(it.level2S);
      const e = Number(it.level2E);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        numeric.push({ scoreS: s, scoreE: e });
      }
    }
    return AssignmentScoringService.hasNumericOverlap(numeric);
  }
}
