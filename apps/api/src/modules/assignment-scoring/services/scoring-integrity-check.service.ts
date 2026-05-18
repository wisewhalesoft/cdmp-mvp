import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { MatchType } from '../dto/match-type.enum';

/**
 * F061 v1.3 BR-13 / AC-7c — Scoring Integrity Soft Check Service
 *
 * 職責：Stage 2 計分執行前掃描 active CARD_TYPE × column，偵測
 *   - ALL_SCORES_EMPTY：active column 但 ob_levelcard_score 無對應列
 *   - 額外擴充（防護網）：COMPOSITE 同 level1 區間反轉等
 *
 * 設計原則（spec BR-13）：
 *   1. application 層獨立 service，**不嵌入 fn_calc_tier_level**
 *   2. **不拋 exception**：回傳 IntegrityResult，月跑繼續執行
 *   3. 每維度每 rule_violated 寫一筆彙總 audit_log（action='SCORING_INTEGRITY_WARN'）
 *   4. 不寫每筆 appl_no 明細（避免日誌爆量）
 *
 * 不在此 service 觸發 fn_calc_tier_level（plpgsql 計分 SP）— 保持解耦。
 */

export type IntegrityRuleViolated =
  | 'ALL_SCORES_EMPTY'
  | 'MISSING_MATCH_TYPE'
  | 'EMPTY_SCORE_RANGE'
  | 'COMPOSITE_MISSING_BASELINE'
  | 'RANGE_INVERTED';

export interface IntegrityIssue {
  type: IntegrityRuleViolated;
  cardType: string;
  columnName: string;
  /** 受影響的 appl_no 計數（由 caller 提供；若不可得則 0） */
  violatedRowCount?: number;
  detail?: string;
}

export interface IntegrityResult {
  ok: boolean;
  issues: IntegrityIssue[];
  /** 彙總警告碼清單（用於 assignment_run.warning_summary） */
  warningSummary: string[];
}

export interface IntegrityCheckOptions {
  /** active 計分版本之 card_version；caller 提供以縮小掃描範圍 */
  cardVersion?: number;
  /** 受影響案件數（用於 audit log violated_row_count）；caller 估算後傳入 */
  affectedRowCount?: number;
  /** 當前月跑 run_id（用於 audit log） */
  runId?: string;
  actorId?: string;
  actorName?: string;
}

@Injectable()
export class ScoringIntegrityCheckService {
  constructor(
    @InjectRepository(ObLevelcardColumn)
    private readonly columnRepo: Repository<ObLevelcardColumn>,
    @InjectRepository(ObLevelcardScore)
    private readonly scoreRepo: Repository<ObLevelcardScore>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
  ) {}

  /**
   * 對單一 (cardType, cardVersion) 執行 soft check。
   *
   * 回傳 IntegrityResult：caller 可依 issues 寫入 assignment_run.skipped_cases /
   * warning_summary 與 audit log（本 service 已寫 audit；caller 不需再寫）。
   */
  async checkIntegrity(
    cardType: string,
    cardVersion: number,
    options: IntegrityCheckOptions = {},
  ): Promise<IntegrityResult> {
    const issues: IntegrityIssue[] = [];

    // 載入 active columns（status='active'，依 BR-13 範圍）
    const columns = await this.columnRepo.find({
      where: {
        card_type: cardType as any,
        card_version: cardVersion as any,
        status: 'active' as any,
      },
    });

    // 載入該版本所有 scores（一次撈 + 記憶體 group 比走多次 query 友善）
    const allScores = await this.scoreRepo.find({
      where: {
        card_type: cardType as any,
        card_version: cardVersion as any,
      },
    });

    for (const col of columns) {
      const columnName = col.column_name ?? '';
      const colScores = allScores.filter((s) => s.column_name === columnName);
      const matchType = (col.match_type as MatchType | null) ?? null;

      // Rule 1: ALL_SCORES_EMPTY — active column 無對應 score 列
      if (colScores.length === 0) {
        issues.push({
          type: 'ALL_SCORES_EMPTY',
          cardType,
          columnName,
          violatedRowCount: options.affectedRowCount ?? 0,
          detail: 'active 維度但 ob_levelcard_score 無對應列，該維度將跳過計分',
        });
        continue;
      }

      // Rule 2: MISSING_MATCH_TYPE — 預期 NOT NULL，防護網
      if (matchType === null) {
        issues.push({
          type: 'MISSING_MATCH_TYPE',
          cardType,
          columnName,
          violatedRowCount: options.affectedRowCount ?? 0,
        });
      }

      // Rule 3: RANGE_INVERTED — level2_s > level2_e 反轉（防護網）
      for (const s of colScores) {
        if (
          s.level2_s != null &&
          s.level2_e != null &&
          !Number.isNaN(Number(s.level2_s)) &&
          !Number.isNaN(Number(s.level2_e)) &&
          Number(s.level2_s) > Number(s.level2_e)
        ) {
          issues.push({
            type: 'RANGE_INVERTED',
            cardType,
            columnName,
            violatedRowCount: options.affectedRowCount ?? 0,
            detail: `level2_s=${s.level2_s} > level2_e=${s.level2_e}`,
          });
          break;
        }
      }

      // Rule 4: COMPOSITE_MISSING_BASELINE — COMPOSITE 維度無 level1=null 基線
      // 註：F054 v1.3 AC-9 要求 COMPOSITE level1 必填；本檢查為防護網保留檢視
      if (matchType === MatchType.COMPOSITE) {
        const hasNullBaseline = colScores.some(
          (s) => s.level1 === null || s.level1 === '',
        );
        if (!hasNullBaseline && colScores.length > 0) {
          // 屬警告（不阻擋），caller 可依 issues 顯示提示
          issues.push({
            type: 'COMPOSITE_MISSING_BASELINE',
            cardType,
            columnName,
            violatedRowCount: 0,
            detail: 'COMPOSITE 維度無 level1=NULL 基線（防護網警告）',
          });
        }
      }
    }

    // 寫入彙總 audit log（每維度每 rule_violated 一筆，不寫 appl_no 明細）
    if (issues.length > 0) {
      await this.writeAggregatedAuditLogs(issues, options);
    }

    const warningSummary = Array.from(new Set(issues.map((i) => i.type)));

    return {
      ok: issues.length === 0,
      issues,
      warningSummary,
    };
  }

  private async writeAggregatedAuditLogs(
    issues: ReadonlyArray<IntegrityIssue>,
    options: IntegrityCheckOptions,
  ): Promise<void> {
    const actorId = options.actorId ?? '00000000-0000-0000-0000-000000000000';
    const actorName = options.actorName ?? 'system';

    const logs = issues.map((i) =>
      this.auditRepo.create({
        entity_type: 'ob_levelcard_column',
        entity_id: `${i.cardType}||${i.columnName}`,
        action: 'SCORING_INTEGRITY_WARN' as any,
        actor_id: actorId,
        actor_name: actorName,
        before_value: null,
        after_value: {
          run_id: options.runId ?? null,
          card_type: i.cardType,
          column_name: i.columnName,
          rule_violated: i.type,
          violated_row_count: i.violatedRowCount ?? 0,
          detail: i.detail ?? null,
        } as Record<string, unknown>,
        ip_address: null,
      }),
    );

    if (logs.length > 0) {
      await this.auditRepo.save(logs);
    }
  }
}
