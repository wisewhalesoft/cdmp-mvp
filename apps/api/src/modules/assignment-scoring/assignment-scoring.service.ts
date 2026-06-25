import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { TIER_LEVEL_ENUM_SET } from './constants/card-type.constants';
import { assertCardTypeActive } from './helpers/card-type-scope.helper';
import {
  detectFallbackStandardMutexViolation,
  TierRow,
} from './helpers/tier-mapping-mutex.helper';
import { MatchType, MATCH_TYPE_VALUES } from './dto/match-type.enum';
import { normalizeCharField } from '@/common/etl/normalize-char-field.util';
// F107：decode 共用對照常數（與引擎衍生規則同源，AD-E07-10-S / BR-2）
import {
  DecodeEntry,
  getDecodeForColumn,
} from '@/modules/assignment/stage1/scoring-decode.constants';

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
  // F055 v1.5 §5.4 POST：(cardType, cardVersion, cardLevel) 已存在於當前存活紀錄
  //   BR-9：hard delete 後 PK 釋放，可重新新增；本檢查僅針對 active 紀錄
  CARD_LEVEL_DUPLICATE: 'CARD_LEVEL_DUPLICATE',
  TIER_MAPPING_NOT_FOUND: 'TIER_MAPPING_NOT_FOUND',
  // v1.5（Iter 3）新增（F056 spec §AC-8 / AC-9 / AC-3 / AC-4a）
  TIER_LEVEL_INVALID_ENUM: 'TIER_LEVEL_INVALID_ENUM',
  CARD_TYPE_FALLBACK_STANDARD_MUTEX: 'CARD_TYPE_FALLBACK_STANDARD_MUTEX',
  CARD_TYPE_NOT_FOUND: 'CARD_TYPE_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // F054 v1.3（2026-05-18）— matchType 與 BR-9 規一化相關
  SCORING_INVALID_MATCH_TYPE: 'SCORING_INVALID_MATCH_TYPE',
  SCORING_MATCH_TYPE_FIELD_MISMATCH: 'SCORING_MATCH_TYPE_FIELD_MISMATCH',
  SCORING_CATEGORY_DUPLICATE: 'SCORING_CATEGORY_DUPLICATE',
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
  CARD_LEVEL_DUPLICATE: '等級代碼已存在於選中計分版本',
  TIER_MAPPING_NOT_FOUND: '指定的 TIER 對應不存在',
  // v1.5（Iter 3）新增
  TIER_LEVEL_INVALID_ENUM: 'TIER_LEVEL 必須為 T1~T10 之一',
  CARD_TYPE_FALLBACK_STANDARD_MUTEX:
    '同一計分卡類型不可同時存在 Fallback 與 Standard 規則',
  CARD_TYPE_NOT_FOUND: '計分卡類型不存在或已停用',
  VALIDATION_ERROR: '請求參數不符規範',
  SCORING_INVALID_MATCH_TYPE:
    'matchType 必須為 CATEGORY / RANGE / COMPOSITE 其中之一',
  SCORING_MATCH_TYPE_FIELD_MISMATCH:
    'matchType 與 scores 欄位不一致（CATEGORY 需 level1、RANGE 需 level2_s/2_e、COMPOSITE 需三欄齊備）',
  SCORING_CATEGORY_DUPLICATE:
    'CATEGORY / COMPOSITE 同一 level1 出現多筆 score 列，請檢查資料',
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
  /** v1.3 AC-7：寫入此欄位以對齊 ob_levelcard_column.match_type */
  matchType: MatchType | null;
  /**
   * F106 AC-2 / BR-1：維度狀態（'active' | 'inactive'）。
   * getScoring 一律回傳全部維度（含 inactive），前端依此 status 渲染、不再 fallback。
   */
  status: 'active' | 'inactive';
  scoreSummary: string;
  scores: ScoringScoreItem[];
  /**
   * F107 §5.1.1 / BR-1 / BR-6：該維度之衍生碼 decode 說明（唯讀）。
   * 無對應 decode 之純數值欄（LIST_MONTH / CAR_YEAR / LOAN_RATE / ADD_UN_CAPITAL …）→ `null`，
   * 前端優雅降級不渲染。內容同源自引擎衍生規則（scoring-decode.constants）。
   */
  decode: DecodeEntry | null;
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
  /** v1.3 BR-8：必填，列舉 CATEGORY / RANGE / COMPOSITE */
  matchType: MatchType;
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
  /** v1.3 AC-2b：本次因 matchType 切換而被自動清空 scores 之 column_name 清單 */
  matchTypeChanged: string[];
}

export interface CreateDimensionInput {
  cardType: string;
  cardVersion: number;
  columnName: string;
  columnLabel: string;
  /** v1.3 BR-8：必填，列舉 CATEGORY / RANGE / COMPOSITE */
  matchType: MatchType;
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

// F106：啟用維度（對稱 disable，狀態與時間戳欄位方向相反）
export interface EnableDimensionResult {
  cardType: string;
  cardVersion: number;
  columnName: string;
  status: 'active';
  enabledAt: string;
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

// F055 v1.5 §5.4 POST
export interface CreateCardLevelInput {
  cardType: string;
  cardLevel: string;
  scoreS: number;
  scoreE: number;
}

export interface CreateCardLevelResult {
  cardType: string;
  cardVersion: number;
  cardLevel: string;
  scoreS: number;
  scoreE: number;
  createdAt: string;
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

export interface GetTierMappingInput {
  cardType: string;
}

export interface GetTierMappingResult {
  cardType: string;
  mappings: Array<{
    cardType: string;
    cardLevel: string | null;
    tierLevel: string;
    listNm: string | null;
  }>;
}

export interface UpdateTierMappingInput {
  /** v1.5：query 帶入 cardType，body 內所有 mapping 必須一致 */
  cardType: string;
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
    @InjectRepository(ObCardType)
    private readonly cardTypeRepo: Repository<ObCardType>,
    @InjectRepository(ObPoolDataList)
    private readonly poolDataListRepo: Repository<ObPoolDataList>,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    /**
     * v1.3 AC-2b：matchType 切換需 atomic transaction（DELETE scores → UPDATE column.match_type
     * → INSERT 新 scores → audit）。注入 DataSource 以支援 QueryRunner 手動 transaction。
     *
     * Optional 標記：unit test 之 mock 不易提供 DataSource，落入非 atomic 路徑（仍寫入正確
     * 但不保證 rollback）；E2E 真實 DI 永遠注入。
     */
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  // =========================
  // F053 — GET /scoring
  // =========================

  async getScoring(query: { cardType?: string }): Promise<GetScoringResult> {
    const cardType = query.cardType;
    // F053 v1.2 AC-7 / BR-4：cardType 範圍鎖（cardType 提供時優先檢查；
    //   path rename + cardType 改必填屬 v1.2 完整重構，超出 Iter 4 增量範圍）
    if (cardType) {
      await assertCardTypeActive(this.cardTypeRepo, cardType);
    }
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

    // F106 BR-1 / AC-2（OQ-164-2）：移除 status='active' 過濾，一律回傳 active + inactive
    // 全部維度（每維度於下方 mapper 補 status 欄位）。計分採計範圍不受影響——
    // 計分引擎 / fn_calc_tier_level 仍只採 status='active'（BR-4）。
    const columns = await this.columnRepo.find({
      where: {
        card_type: cardType as any,
        card_version: cardVersion as any,
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
        matchType: (col.match_type as MatchType) ?? null,
        // F106 AC-2 / BR-1：每維度必含 status；非 'active' 一律視為 'inactive'
        status: (col.status === 'active' ? 'active' : 'inactive') as
          | 'active'
          | 'inactive',
        scoreSummary: `${colScores.length} 個區間`,
        scores: colScores.map((s) => ({
          level1: s.level1,
          level2S: s.level2_s,
          level2E: s.level2_e,
          score: s.score,
        })),
        // F107 §5.1.1 / BR-1 / BR-6：附唯讀 decode；純數值欄回 null（前端優雅降級）。
        decode: getDecodeForColumn(col.column_name ?? ''),
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

    // F054 v1.2 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // v1.3 BR-9：規一化各 dim 的 level1（'' / 空白 → null、保留 trim 後值）
    const normalized = input.dimensions.map((dim) => ({
      ...dim,
      scores: dim.scores.map((s) => ({
        ...s,
        level1: normalizeCharField(s.level1 ?? null),
      })),
    }));

    // v1.3 BR-8：matchType 必填且合法（DTO 層已驗，service 層雙重把關）
    for (const dim of normalized) {
      AssignmentScoringService.assertMatchTypeValid(dim.matchType);
      AssignmentScoringService.assertMatchTypeFieldConsistency(
        dim.matchType,
        dim.scores,
      );
    }

    // v1.3 AC-6：依 matchType 分流驗證
    for (const dim of normalized) {
      AssignmentScoringService.assertScoresValidPerMatchType(
        dim.matchType,
        dim.scores,
      );
    }

    let updatedDimensions = 0;
    let updatedScores = 0;
    const matchTypeChanged: string[] = [];

    for (const dim of normalized) {
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

      const oldMatchType = column.match_type ?? null;
      const matchTypeChanging =
        oldMatchType !== null && oldMatchType !== dim.matchType;

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
        matchType: oldMatchType,
        scores: oldScores.map((s) => ({
          level1: s.level1,
          level2S: s.level2_s,
          level2E: s.level2_e,
          score: s.score,
        })),
      };

      const newRowsData = dim.scores.map((s) => ({
        card_type: input.cardType,
        card_version: input.cardVersion,
        column_name: dim.columnName,
        level1: s.level1 ?? null,
        level2_s: s.level2S ?? null,
        level2_e: s.level2E ?? null,
        score: s.score,
      }));

      // v1.3 AC-2b：matchType 切換需 atomic（DELETE scores → UPDATE column.match_type
      // → INSERT 新 scores）。優先以 DataSource transaction；單元測試環境無 DataSource 時
      // 退化為非 atomic 順序執行，仍寫入正確結果（測試以 mock 觀察行為即可）。
      if (this.dataSource) {
        await this.dataSource.transaction(async (manager) => {
          await manager.getRepository(ObLevelcardScore).delete({
            card_type: input.cardType as any,
            card_version: input.cardVersion as any,
            column_name: dim.columnName as any,
          });

          column.column_label = dim.columnLabel;
          column.match_type = dim.matchType;
          await manager.getRepository(ObLevelcardColumn).save(column);

          if (newRowsData.length > 0) {
            await manager
              .getRepository(ObLevelcardScore)
              .save(newRowsData as any);
          }
        });
      } else {
        await this.scoreRepo.delete({
          card_type: input.cardType as any,
          card_version: input.cardVersion as any,
          column_name: dim.columnName as any,
        });

        column.column_label = dim.columnLabel;
        column.match_type = dim.matchType;
        await this.columnRepo.save(column);

        if (newRowsData.length > 0) {
          const newRows = newRowsData.map((r) => this.scoreRepo.create(r as any));
          await this.scoreRepo.save(newRows as any);
        }
      }

      const afterSnapshot = {
        columnLabel: dim.columnLabel,
        matchType: dim.matchType,
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

      if (matchTypeChanging) {
        matchTypeChanged.push(dim.columnName);
      }

      updatedDimensions += 1;
      updatedScores += dim.scores.length;
    }

    return {
      cardType: input.cardType,
      cardVersion: input.cardVersion,
      updatedDimensions,
      updatedScores,
      matchTypeChanged,
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

    // F054 v1.2 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // v1.3 BR-8：matchType 必填且合法（DTO 層已驗，service 層雙重把關）
    AssignmentScoringService.assertMatchTypeValid(input.matchType);

    // v1.3 BR-9：規一化 level1
    const normalizedScores = input.scores.map((s) => ({
      ...s,
      level1: normalizeCharField(s.level1 ?? null),
    }));

    // v1.3 AC-9：matchType 與 scores 欄位一致性
    AssignmentScoringService.assertMatchTypeFieldConsistency(
      input.matchType,
      normalizedScores,
    );

    // v1.3 AC-6：依 matchType 分流驗證
    AssignmentScoringService.assertScoresValidPerMatchType(
      input.matchType,
      normalizedScores,
    );

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

    // 寫入 column（含 match_type）
    const newColumn = this.columnRepo.create({
      card_type: input.cardType,
      card_version: input.cardVersion,
      column_name: input.columnName,
      column_label: input.columnLabel,
      status: 'active',
      match_type: input.matchType,
    } as any);
    await this.columnRepo.save(newColumn);

    // 寫入 scores
    if (normalizedScores.length > 0) {
      const rows = normalizedScores.map((s) =>
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

    // audit_log（v1.3：after_value 含 matchType / card_type / column_name 對齊 F061 AC-9）
    await this.writeAudit(
      actor,
      'CREATE',
      'ob_levelcard_column',
      `${input.cardType}|${input.cardVersion}|${input.columnName}`,
      null,
      {
        card_type: input.cardType,
        column_name: input.columnName,
        columnName: input.columnName,
        columnLabel: input.columnLabel,
        matchType: input.matchType,
        scores: normalizedScores.map((s) => ({
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

    // F054 v1.2 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, cardType);

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
  // F106 — PUT /scoring/dimensions/:columnName/enable（重新啟用，對稱 disable）
  // =========================
  //
  // 對應 spec：F106 §5.2 / §5.3 對稱性對照表 / BR-2 / BR-3 / BR-5
  //   行為完全對稱於 disableDimension，僅狀態方向相反：
  //     1. assertNotLocked()（月跑鎖 → 409 SCORING_VERSION_LOCKED）
  //     2. assertCardTypeActive()（範圍鎖 → 404 CARD_TYPE_NOT_FOUND）
  //     3. findOne(status='inactive')；找不到（含對已 active 維度啟用，BR-3）→ 404 SCORING_COLUMN_NOT_FOUND
  //     4. status='inactive' → 'active'，save
  //     5. writeAudit(action='ENABLE'，before {status:'inactive'} / after {status:'active'})
  //     6. 回傳 { ..., status:'active', enabledAt }

  async enableDimension(
    cardType: string,
    columnName: string,
    actor: ActorContext,
  ): Promise<EnableDimensionResult> {
    await this.assertNotLocked();

    // F106 §5.3：cardType 範圍鎖（對稱 disable）
    await assertCardTypeActive(this.cardTypeRepo, cardType);

    // findOne 限定 status='inactive'（方向相反於 disable 的 'active'）；
    // 對已 active 維度啟用 → findOne 找不到 → 404（BR-3，對稱慣例，不採冪等 200）
    const existing = await this.columnRepo.findOne({
      where: {
        card_type: cardType as any,
        column_name: columnName as any,
        status: 'inactive' as any,
      },
    });
    if (!existing) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.SCORING_COLUMN_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.SCORING_COLUMN_NOT_FOUND,
      });
    }

    const before = { status: 'inactive' as const };

    existing.status = 'active';
    await this.columnRepo.save(existing);

    const after = { status: 'active' as const };

    const cardVersion = existing.card_version ?? 1;

    await this.writeAudit(
      actor,
      'ENABLE',
      'ob_levelcard_column',
      `${cardType}|${cardVersion}|${columnName}`,
      before,
      after,
    );

    return {
      cardType,
      cardVersion,
      columnName,
      status: 'active',
      enabledAt: new Date().toISOString(),
    };
  }

  // =========================
  // F055 — GET /scoring/card-levels（§5.1.1，列表）
  // =========================

  async getCardLevels(input: GetCardLevelsInput): Promise<GetCardLevelsResult> {
    // F055 v1.4 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

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
    // F055 v1.4 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

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

    // F055 §5.2 / risk-1：preview 以既有 score 套用新門檻試算分佈（非重呼 fn_calc_tier_level）。
    //
    // ⚠️ 效能修正（2026-06-02 OOM 事故）：原實作 `poolDataListRepo.find()` 會把整張
    // ob_pool_data_list（生產規模可達數百萬列）全數 hydrate 進 Node 記憶體再於 JS 分桶，
    // 導致 heap 撞 ~2GB 上限 → 進程 OOM 崩潰 → 該頁所有在途 API 收到 500（違反 CLAUDE.md
    // 「巨量資料勿用 in-memory，須 streaming / SQL 下推」鐵則）。改為將分桶 COUNT 下推
    // PostgreSQL：單一 GROUP BY 聚合僅回傳各等級計數，記憶體佔用與資料量脫鉤。
    const distribution: Record<string, number> = {};
    for (const l of parsedLevels) {
      distribution[l.cardLevel] = 0;
    }

    // 無等級可分桶時直接回傳（避免組出非法的空 CASE 子句）
    if (parsedLevels.length === 0) {
      return { distribution };
    }

    // 動態組裝 first-match-wins 的 CASE 分桶（等級區間不重疊由 BR-3 保證）。
    // score 為 NULL（尚未計分）的列一律不計入任何等級；所有使用者輸入均以參數化
    // 佔位符傳入，杜絕 SQL injection。
    const whenClauses: string[] = [];
    const params: Array<number | string> = [];
    for (const l of parsedLevels) {
      params.push(l.scoreS, l.scoreE, l.cardLevel);
      const n = params.length;
      whenClauses.push(
        `WHEN score >= $${n - 2} AND score <= $${n - 1} THEN $${n}`,
      );
    }

    const bucketRows: Array<{ bucket: string; cnt: number | string }> =
      await this.poolDataListRepo.query(
        `SELECT bucket, COUNT(*)::int AS cnt
           FROM (
             SELECT CASE ${whenClauses.join(' ')} ELSE NULL END AS bucket
               FROM ob_pool_data_list
              WHERE score IS NOT NULL
           ) sub
          WHERE bucket IS NOT NULL
          GROUP BY bucket`,
        params,
      );

    for (const r of bucketRows) {
      if (Object.prototype.hasOwnProperty.call(distribution, r.bucket)) {
        distribution[r.bucket] = Number(r.cnt);
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

    // F055 v1.4 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

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

    // F055 v1.4 AC-7 / BR-7：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

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
  // F055 v1.5 — POST /scoring/card-levels（§5.4，單筆 INSERT）
  // =========================
  //
  // 對應 spec：F055 v1.5 §5.4 / AC-8 ~ AC-8f / BR-1 / BR-7 / BR-8 / BR-9
  //
  //   驗證順序（依 spec §5.4 寫入語意；月跑鎖前置以對齊既有 deleteCardLevel/updateCardLevels 慣例）：
  //     0. 月跑鎖（BR-3）：assignment_run pending/running → 409 SCORING_VERSION_LOCKED
  //     1. cardType 範圍鎖（BR-7）：ob_card_type.status=active → 404 CARD_TYPE_NOT_FOUND
  //     2. scoreE >= scoreS 業務驗證 → 422 VALIDATION_ERROR
  //        （cardLevel 格式 ^[A-Z]$ 已由 DTO @Matches 處理，HTTP 422 由 NestJS ValidationPipe 拋出）
  //     3. 取 active 計分版本（BR-4）：ob_levelcard_version.status=active → 404 SCORING_VERSION_NOT_FOUND
  //     4. dedup（BR-9）：當前存活 (cardType, cardVersion, cardLevel) 已存在 → 422 CARD_LEVEL_DUPLICATE
  //     5. 與既有等級區間不重疊（BR-1 v1.5 — 允許 gap）→ 422 SCORING_RANGE_OVERLAP
  //     6. INSERT + audit (action=CREATE, entity_id={cardType}|{cardVersion}|{cardLevel},
  //                       before_value=null, after_value={cardLevel, scoreS, scoreE})

  async createCardLevel(
    input: CreateCardLevelInput,
    actor: ActorContext,
  ): Promise<CreateCardLevelResult> {
    // 0. 月跑鎖（BR-3）
    await this.assertNotLocked();

    // 1. cardType 範圍鎖（BR-7）
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // 2. scoreE >= scoreS 業務驗證
    if (input.scoreE < input.scoreS) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.VALIDATION_ERROR,
        message: `scoreE (${input.scoreE}) 必須 >= scoreS (${input.scoreS})`,
        details: { field: 'scoreE', scoreS: input.scoreS, scoreE: input.scoreE },
      });
    }

    // 3. 取 active 計分版本
    const version = await this.versionRepo.findOne({
      where: { card_type: input.cardType as any, status: 'active' as any },
    });
    if (!version) {
      throw new NotFoundException({
        error: SCORING_ERROR_CODES.SCORING_VERSION_NOT_FOUND,
        message: SCORING_ERROR_MESSAGES.SCORING_VERSION_NOT_FOUND,
      });
    }
    const cardVersion = version.card_version ?? 1;

    // 4. dedup（BR-9：僅針對當前存活紀錄）
    const existing = await this.levelRepo.findOne({
      where: {
        card_type: input.cardType as any,
        card_version: cardVersion as any,
        card_level: input.cardLevel as any,
      },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.CARD_LEVEL_DUPLICATE,
        message: `等級代碼 ${input.cardLevel} 已存在於選中計分版本`,
        details: {
          cardType: input.cardType,
          cardVersion,
          cardLevel: input.cardLevel,
        },
      });
    }

    // 5. 與既有等級區間不重疊（BR-1 v1.5 — 允許 gap）
    const existingLevels = await this.levelRepo.find({
      where: {
        card_type: input.cardType as any,
        card_version: cardVersion as any,
      },
    });
    const merged = [
      ...existingLevels.map((l) => ({ scoreS: l.score_s, scoreE: l.score_e })),
      { scoreS: input.scoreS, scoreE: input.scoreE },
    ];
    if (AssignmentScoringService.hasNumericOverlap(merged)) {
      // 找出哪個既有等級與新筆重疊（供前端顯示 conflictLevel）
      const conflict = existingLevels.find(
        (l) => !(input.scoreE < l.score_s || input.scoreS > l.score_e),
      );
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
        message: conflict
          ? `新增等級 ${input.cardLevel} 區間 ${input.scoreS}~${input.scoreE} 與既有等級 ${conflict.card_level} 區間 ${conflict.score_s}~${conflict.score_e} 重疊，請調整`
          : SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
        details: conflict
          ? {
              cardLevel: input.cardLevel,
              scoreS: input.scoreS,
              scoreE: input.scoreE,
              conflictLevel: conflict.card_level,
              conflictScoreS: conflict.score_s,
              conflictScoreE: conflict.score_e,
            }
          : undefined,
      });
    }

    // 6. INSERT
    const newRow = this.levelRepo.create({
      card_type: input.cardType,
      card_version: cardVersion,
      card_level: input.cardLevel,
      score_s: input.scoreS,
      score_e: input.scoreE,
    } as any);
    await this.levelRepo.save(newRow);

    // audit log
    await this.writeAudit(
      actor,
      'CREATE',
      'ob_levelcard_level',
      `${input.cardType}|${cardVersion}|${input.cardLevel}`,
      null,
      {
        cardLevel: input.cardLevel,
        scoreS: input.scoreS,
        scoreE: input.scoreE,
      },
    );

    return {
      cardType: input.cardType,
      cardVersion,
      cardLevel: input.cardLevel,
      scoreS: input.scoreS,
      scoreE: input.scoreE,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================
  // F056 v1.5 — GET /scoring/tier-mapping（§5.1）
  // =========================

  async getTierMapping(
    input: GetTierMappingInput,
  ): Promise<GetTierMappingResult> {
    // v1.5 AC-9：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // v1.5 AC-1：僅回傳該 cardType 的紀錄
    const rows = await this.tierRepo.find({
      where: { card_type: input.cardType as any },
    });

    // 依 card_level（NULLS LAST）升冪
    const sorted = [...rows].sort((a, b) => {
      const aNull = a.card_level == null;
      const bNull = b.card_level == null;
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      if (aNull && bNull) return 0;
      return (a.card_level ?? '').localeCompare(b.card_level ?? '');
    });

    return {
      cardType: input.cardType,
      mappings: sorted.map((r) => ({
        cardType: r.card_type,
        cardLevel: r.card_level,
        tierLevel: r.tier_level,
        listNm: r.list_nm,
      })),
    };
  }

  // =========================
  // F056 v1.5 — PUT /scoring/tier-mapping（§5.2，批次 UPSERT）
  // =========================

  async updateTierMapping(
    input: UpdateTierMappingInput,
    actor: ActorContext,
  ): Promise<UpdateTierMappingResult> {
    // BR-5：月跑鎖（保留既有錯誤碼 SCORING_VERSION_LOCKED）
    await this.assertNotLocked();

    // v1.5 AC-9：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // v1.5：body 內所有 mapping 之 cardType 必須與 query cardType 一致
    for (const m of input.mappings) {
      if (m.cardType !== input.cardType) {
        throw new UnprocessableEntityException({
          error: SCORING_ERROR_CODES.VALIDATION_ERROR,
          message: `mapping cardType '${m.cardType}' 與 query cardType '${input.cardType}' 不一致`,
          details: { field: 'mappings.cardType', expected: input.cardType, actual: m.cardType },
        });
      }
    }

    // v1.5 AC-8：tierLevel 列舉檢查（service 端額外把關，防 client 跳過 pipe）
    for (const m of input.mappings) {
      this.assertTierLevelValid(m.tierLevel);
    }

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

    // v1.5 AC-3 / AC-4a / BR-13：Fallback/Standard 互斥檢查
    //   依「DB 既有 + body 預定寫入」最終態組合判斷
    await this.assertFallbackStandardMutex(input.cardType, input.mappings);

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

    // v1.5 AC-9：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

    // v1.5 AC-8：tierLevel 列舉檢查
    this.assertTierLevelValid(input.tierLevel);

    // BR-3 / BR-9：CARD_LEVEL 非 NULL 時必須存在於 active 版本；>1 字元視同不存在
    await this.assertCardLevelExistsOrFallback(input.cardType, input.cardLevel);

    // v1.5 AC-3 / AC-4a / BR-13：Fallback/Standard 互斥檢查
    //   單筆 POST 場景：以「DB 既有 + 本筆 INSERT」最終態判斷
    await this.assertFallbackStandardMutex(input.cardType, [
      {
        cardType: input.cardType,
        cardLevel: input.cardLevel,
        tierLevel: input.tierLevel,
        listNm: input.listNm ?? null,
      },
    ]);

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

    // v1.5 AC-9：cardType 範圍鎖
    await assertCardTypeActive(this.cardTypeRepo, input.cardType);

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
   * v1.5 AC-8：tierLevel 必須屬於 T1~T10 列舉，否則 422 TIER_LEVEL_INVALID_ENUM。
   *   service 端 assert（DTO @IsIn 為主、service 為輔，雙重把關）。
   */
  private assertTierLevelValid(tierLevel: string): void {
    if (!TIER_LEVEL_ENUM_SET.has(tierLevel)) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.TIER_LEVEL_INVALID_ENUM,
        message: `${SCORING_ERROR_MESSAGES.TIER_LEVEL_INVALID_ENUM}，目前值：${tierLevel}`,
        details: { field: 'tierLevel', value: tierLevel },
      });
    }
  }

  /**
   * v1.5 AC-3 / AC-4a / BR-13：Fallback/Standard 互斥檢查（應用層 Mutex）。
   *
   * 判斷邏輯：合併「DB 既有 + 本批次預定寫入」之最終態，呼叫 pure helper
   *   detectFallbackStandardMutexViolation 判斷是否存在 null + 非 null cardLevel
   *   並存於同一 cardType。
   *
   * @param cardType  目標 cardType
   * @param incoming  本次預定寫入的 mapping items（POST 為 1 筆，PUT 為 N 筆）
   */
  private async assertFallbackStandardMutex(
    cardType: string,
    incoming: ReadonlyArray<TierMappingItem>,
  ): Promise<void> {
    const dbRows = await this.tierRepo.find({
      where: { card_type: cardType as any },
    });

    // 將 DB 既有與 incoming 合併為最終態：incoming 中的 (cardType, cardLevel) 覆寫 DB 既有，
    // 未涵蓋之既有保留。
    const incomingKey = (m: { cardType: string; cardLevel: string | null }) =>
      `${m.cardType}|${m.cardLevel ?? '__NULL__'}`;
    const incomingKeys = new Set(incoming.map(incomingKey));

    const merged: TierRow[] = [];
    for (const r of dbRows) {
      const key = incomingKey({ cardType: r.card_type, cardLevel: r.card_level });
      if (!incomingKeys.has(key)) {
        merged.push({ cardType: r.card_type, cardLevel: r.card_level });
      }
    }
    for (const m of incoming) {
      merged.push({ cardType: m.cardType, cardLevel: m.cardLevel });
    }

    if (detectFallbackStandardMutexViolation(merged, cardType)) {
      // 為前端錯誤訊息提供有用上下文：計算最終態 standard / fallback 筆數
      const sameCardType = merged.filter((r) => r.cardType === cardType);
      const standardCount = sameCardType.filter((r) => r.cardLevel != null).length;
      const fallbackCount = sameCardType.filter((r) => r.cardLevel == null).length;
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.CARD_TYPE_FALLBACK_STANDARD_MUTEX,
        message:
          `${SCORING_ERROR_MESSAGES.CARD_TYPE_FALLBACK_STANDARD_MUTEX}：` +
          `CARD_TYPE ${cardType} 同時存在 ${standardCount} 筆 Standard + ${fallbackCount} 筆 Fallback`,
        details: {
          cardType,
          standardCount,
          fallbackCount,
        },
      });
    }
  }

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
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISABLE' | 'ENABLE',
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
      // 沿用 F068 cast pattern 允許 DISABLE / ENABLE 寫入（DB schema varchar(10) 容許）
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
   * v1.3 BR-8：matchType 必為列舉 CATEGORY / RANGE / COMPOSITE 之一。
   * 缺值 / 非法值 → 422 SCORING_INVALID_MATCH_TYPE。
   */
  static assertMatchTypeValid(matchType: unknown): void {
    if (
      typeof matchType !== 'string' ||
      !(MATCH_TYPE_VALUES as readonly string[]).includes(matchType)
    ) {
      throw new UnprocessableEntityException({
        error: SCORING_ERROR_CODES.SCORING_INVALID_MATCH_TYPE,
        message: SCORING_ERROR_MESSAGES.SCORING_INVALID_MATCH_TYPE,
        details: { field: 'matchType', value: matchType },
      });
    }
  }

  /**
   * v1.3 AC-9：matchType 與 scores 欄位一致性。
   *   - CATEGORY: level1 必填、level2_s/2_e 必須 NULL
   *   - RANGE:    level1 必須 NULL、level2_s/2_e 必填
   *   - COMPOSITE: level1 / level2_s / 2_e 三欄皆必填
   *
   * 違反 → 422 SCORING_MATCH_TYPE_FIELD_MISMATCH。
   */
  static assertMatchTypeFieldConsistency(
    matchType: MatchType,
    scores: ReadonlyArray<{
      level1?: string | null;
      level2S?: string | null;
      level2E?: string | null;
    }>,
  ): void {
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      const l1 = s.level1 == null ? null : s.level1;
      const l2s = s.level2S == null ? null : s.level2S;
      const l2e = s.level2E == null ? null : s.level2E;

      if (matchType === MatchType.CATEGORY) {
        if (l1 === null || l2s !== null || l2e !== null) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_MATCH_TYPE_FIELD_MISMATCH,
            message:
              `${SCORING_ERROR_MESSAGES.SCORING_MATCH_TYPE_FIELD_MISMATCH} ` +
              `(index=${i}, matchType=CATEGORY 要 level1 必填且 level2_s/2_e=NULL)`,
            details: { index: i, matchType, level1: l1, level2S: l2s, level2E: l2e },
          });
        }
      } else if (matchType === MatchType.RANGE) {
        if (l1 !== null || l2s === null || l2e === null) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_MATCH_TYPE_FIELD_MISMATCH,
            message:
              `${SCORING_ERROR_MESSAGES.SCORING_MATCH_TYPE_FIELD_MISMATCH} ` +
              `(index=${i}, matchType=RANGE 要 level1=NULL 且 level2_s/2_e 必填)`,
            details: { index: i, matchType, level1: l1, level2S: l2s, level2E: l2e },
          });
        }
      } else if (matchType === MatchType.COMPOSITE) {
        if (l1 === null || l2s === null || l2e === null) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_MATCH_TYPE_FIELD_MISMATCH,
            message:
              `${SCORING_ERROR_MESSAGES.SCORING_MATCH_TYPE_FIELD_MISMATCH} ` +
              `(index=${i}, matchType=COMPOSITE 要 level1 / level2_s / 2_e 三欄齊備)`,
            details: { index: i, matchType, level1: l1, level2S: l2s, level2E: l2e },
          });
        }
      }
    }
  }

  /**
   * v1.3 AC-6：依 matchType 分流驗證。
   *   - RANGE:     [level2_s, level2_e] 區間交集不為空 → 422 SCORING_RANGE_OVERLAP
   *   - CATEGORY:  同 level1（規一化後）重複 → 422 SCORING_CATEGORY_DUPLICATE
   *   - COMPOSITE: 同 level1 內套 RANGE 規則；不同 level1 不算重疊；
   *                同 (level1, level2_s, level2_e) 三元組重複 → 422 SCORING_CATEGORY_DUPLICATE
   */
  static assertScoresValidPerMatchType(
    matchType: MatchType,
    scores: ReadonlyArray<{
      level1?: string | null;
      level2S?: string | null;
      level2E?: string | null;
    }>,
  ): void {
    if (matchType === MatchType.RANGE) {
      const intervals = scores.map((s) => ({
        level2S: s.level2S ?? null,
        level2E: s.level2E ?? null,
      }));
      if (AssignmentScoringService.hasStringIntervalOverlap(intervals)) {
        throw new UnprocessableEntityException({
          error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
          message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
        });
      }
      return;
    }

    if (matchType === MatchType.CATEGORY) {
      const seen = new Set<string>();
      for (const s of scores) {
        const key = s.level1 ?? '';
        if (seen.has(key)) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_CATEGORY_DUPLICATE,
            message: SCORING_ERROR_MESSAGES.SCORING_CATEGORY_DUPLICATE,
            details: { matchType, level1: key },
          });
        }
        seen.add(key);
      }
      return;
    }

    if (matchType === MatchType.COMPOSITE) {
      // 1) 同 (level1, level2_s, level2_e) 三元組唯一
      const tripleSeen = new Set<string>();
      for (const s of scores) {
        const key = `${s.level1 ?? ''}|${s.level2S ?? ''}|${s.level2E ?? ''}`;
        if (tripleSeen.has(key)) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_CATEGORY_DUPLICATE,
            message: SCORING_ERROR_MESSAGES.SCORING_CATEGORY_DUPLICATE,
            details: { matchType, triple: key },
          });
        }
        tripleSeen.add(key);
      }

      // 2) 同 level1 內套 RANGE 不可重疊；不同 level1 不算重疊
      const groupByLevel1 = new Map<
        string,
        Array<{ level2S: string | null; level2E: string | null }>
      >();
      for (const s of scores) {
        const k = s.level1 ?? '';
        const list = groupByLevel1.get(k) ?? [];
        list.push({ level2S: s.level2S ?? null, level2E: s.level2E ?? null });
        groupByLevel1.set(k, list);
      }
      for (const [, intervals] of groupByLevel1) {
        if (AssignmentScoringService.hasStringIntervalOverlap(intervals)) {
          throw new UnprocessableEntityException({
            error: SCORING_ERROR_CODES.SCORING_RANGE_OVERLAP,
            message: SCORING_ERROR_MESSAGES.SCORING_RANGE_OVERLAP,
          });
        }
      }
      return;
    }
  }

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
