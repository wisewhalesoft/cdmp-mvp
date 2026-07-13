import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { PooldataFieldWhitelistService } from './pooldata-field-whitelist.service';

/**
 * F076 v1.3 / P1 B5：類別型欄位可選值 CRUD Service
 *
 * 設計重點：
 *   - 寫入前須由 PooldataFieldWhitelistService.assertCategorical() 守門（BR-2）
 *   - 軟刪除（is_active=false + deactivation_reason）；無 hard delete（BR-3）
 *   - 停用必走專屬端點 deactivate()，reason 必填 ≤ 200 字（BR-13 / §5.4）
 *   - 重新啟用清空 deactivation_reason 為 NULL
 *   - PATCH 不接受 isActive=false（DTO 層級防呆 @Equals(true)）
 *   - F075 PATCH field_type 切離 categorical 時，由 PooldataFieldWhitelistService 同 tx 批次軟停用
 *     （此 service 不主動觸發，避免循環依賴）
 *
 * audit log action 統一用 'UPDATE'（依使用者指示）；details 帶 reason / deactivationReason。
 */

export interface ActorContext {
  userId: string;
  ipAddress?: string | null;
}

export interface PooldataOptionItem {
  optionValue: string;
  optionLabel: string;
  displayOrder: number;
  isActive: boolean;
  deactivationReason: 'manual' | 'field_type_changed' | null;
}

export interface ListPooldataOptionsResult {
  columnName: string;
  options: PooldataOptionItem[];
}

export interface CreatePooldataOptionInput {
  optionValue: string;
  optionLabel: string;
}

export interface CreatePooldataOptionResult {
  columnName: string;
  optionValue: string;
  optionLabel: string;
  displayOrder: number;
  isActive: true;
}

export interface DeactivatePooldataOptionResult {
  columnName: string;
  optionValue: string;
  optionLabel: string;
  isActive: false;
  deactivationReason: 'manual';
  reason: string;
}

export interface ReactivatePooldataOptionResult {
  columnName: string;
  optionValue: string;
  optionLabel: string;
  isActive: true;
}

// F112 / AD-E07-47 §3.7：批次新增可選值結果（LOCAL；不進 @cdmp/shared）
export interface BulkCreateOptionsResult {
  columnName: string;
  createdCount: number;
  skippedCount: number;
  options: Array<{ optionValue: string; optionLabel: string; isActive: true }>;
}

@Injectable()
export class PooldataFieldOptionService {
  constructor(
    @InjectRepository(PooldataFieldOption)
    private readonly optionRepo: Repository<PooldataFieldOption>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly whitelistService: PooldataFieldWhitelistService,
  ) {}

  // ========================
  // F076 §5.1 — GET /pooldata-fields/:columnName/options
  // ========================

  async listOptions(
    columnName: string,
    query: { active?: 'true' | 'false'; includeInactive?: 'true' | 'false' } = {},
  ): Promise<ListPooldataOptionsResult> {
    await this.whitelistService.assertCategorical(columnName);

    const where: Record<string, unknown> = { column_name: columnName };

    // includeInactive 優先（spec §5.1 / BR-12）
    if (query.includeInactive === 'true') {
      // 不加 is_active filter，全部回傳
    } else if (query.active === 'true') {
      where.is_active = true;
    } else if (query.active === 'false') {
      where.is_active = false;
    }
    // 預設（無 query）：等同 v1.2 行為 — 全部回傳（spec §5.1 註：「不帶則回啟用值，等同於 v1.2 既有行為」
    //   但 v1.2 行為實際是「不帶則全部」，依使用者口頭測試需求 TC-INCLUDE-INACTIVE 行為再對齊）；
    //   採保守做法：不帶 query → 全部回傳，便於 F076 維護頁直接顯示停用 / 啟用列表。

    const rows = await this.optionRepo.find({
      where,
      order: { display_order: 'ASC', option_value: 'ASC' },
    });

    return {
      columnName,
      options: rows.map((r) => this._toItem(r)),
    };
  }

  // ========================
  // F076 §5.2 — POST /pooldata-fields/:columnName/options
  // ========================

  async createOption(
    columnName: string,
    input: CreatePooldataOptionInput,
    actor: ActorContext,
  ): Promise<CreatePooldataOptionResult> {
    await this.whitelistService.assertCategorical(columnName);

    // AC-5：唯一性 — 含啟用 / 停用皆視為衝突
    const existing = await this.optionRepo.findOne({
      where: { column_name: columnName, option_value: input.optionValue },
    });
    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.POOLDATA_OPTION_DUPLICATE,
        message: ERROR_MESSAGES.POOLDATA_OPTION_DUPLICATE,
      });
    }

    // 新增選項預設接續在既有最大 display_order 之後（append at end）
    const [lastByOrder] = await this.optionRepo.find({
      where: { column_name: columnName },
      order: { display_order: 'DESC' },
      take: 1,
    });
    const nextDisplayOrder = (lastByOrder?.display_order ?? -1) + 1;

    const now = new Date();
    const row = this.optionRepo.create({
      column_name: columnName,
      option_value: input.optionValue,
      option_label: input.optionLabel,
      display_order: nextDisplayOrder,
      is_active: true,
      deactivation_reason: null,
      created_at: now,
      updated_at: now,
    });
    const saved = await this.optionRepo.save(row);

    await this._writeAudit(actor, 'CREATE', columnName, input.optionValue, null, {
      optionValue: saved.option_value,
      optionLabel: saved.option_label,
      displayOrder: saved.display_order,
      isActive: saved.is_active,
    });

    return {
      columnName,
      optionValue: saved.option_value,
      optionLabel: saved.option_label,
      displayOrder: saved.display_order,
      isActive: true,
    };
  }

  // ============================================================
  // F112 / AD-E07-47 §3.7 — POST /pooldata-fields/:columnName/options/bulk
  // ============================================================

  /**
   * 單一 transaction 批次新增可選值（兩進入點共用）。
   *
   * 行為（AD §3.7 / spec §5.2 / BR-3；I-DVAL-BULK-TX-01）：
   *   - 守門（tx 外，與 createOption 一致）：不存在 → 404；非 categorical → 400（reuse assertCategorical）
   *   - 單一 tx 內：**一次** `manager.find` 同時推導既有 option_value 集合（含 inactive）與 maxOrder，
   *     不對每個候選值各自查詢
   *   - 依輸入順序：既有值（含 inactive）或批次內重複（首次為準）→ 略過（skippedCount++，不改動既有紀錄、
   *     不回 409）；否則 INSERT（is_active=true、option_label=傳入值、display_order=++maxOrder）→ createdCount++
   *   - 稽核：tx 外寫入**單一彙總紀錄**（`_writeBulkAudit`；I-DVAL-AUDIT-SUMMARY-01），失敗不 rollback
   *
   * 與單筆 `createOption` 之差異（刻意，非疏漏）：createOption 對重複值 409；bulk 冪等略過（AC-15/BR-3），
   * 故不共用 createOption 之單筆邏輯。
   */
  async createOptionsBulk(
    columnName: string,
    options: Array<{ optionValue: string; optionLabel: string }>,
    actor: ActorContext,
  ): Promise<BulkCreateOptionsResult> {
    await this.whitelistService.assertCategorical(columnName);

    const created = await this.optionRepo.manager.transaction(
      async (manager) => {
        // I-DVAL-BULK-TX-01：既有值判定與 max display_order 推導共用同一次查詢結果
        const existingRows = await manager.find(PooldataFieldOption, {
          where: { column_name: columnName },
        });
        const existingValues = new Set(
          existingRows.map((r) => r.option_value),
        );
        let maxOrder = existingRows.reduce(
          (max, r) => Math.max(max, r.display_order),
          -1,
        );

        const seenInBatch = new Set<string>();
        const toInsert: PooldataFieldOption[] = [];
        const now = new Date();

        for (const opt of options) {
          // 略過：DB 既有值（含 inactive）或批次內重複（首次為準）——BR-3
          if (
            existingValues.has(opt.optionValue) ||
            seenInBatch.has(opt.optionValue)
          ) {
            continue;
          }
          seenInBatch.add(opt.optionValue);
          maxOrder += 1;
          toInsert.push(
            manager.create(PooldataFieldOption, {
              column_name: columnName,
              option_value: opt.optionValue,
              option_label: opt.optionLabel,
              display_order: maxOrder,
              is_active: true,
              deactivation_reason: null,
              created_at: now,
              updated_at: now,
            }),
          );
        }

        // toInsert 為空（全數略過）時不呼叫 save（避免無謂 round-trip）
        if (toInsert.length > 0) {
          await manager.save(PooldataFieldOption, toInsert);
        }
        return toInsert;
      },
    );

    // 稽核於 tx 外寫入（沿用「稽核失敗不 rollback」BR-7）
    await this._writeBulkAudit(
      actor,
      columnName,
      created,
      options.length - created.length,
    );

    return {
      columnName,
      createdCount: created.length,
      skippedCount: options.length - created.length,
      options: created.map((r) => ({
        optionValue: r.option_value,
        optionLabel: r.option_label,
        isActive: true as const,
      })),
    };
  }

  // ========================
  // F076 §5.3 — PATCH /pooldata-fields/:columnName/options/:optionValue（啟用用途）
  // ========================

  async reactivateOption(
    columnName: string,
    optionValue: string,
    input: { optionLabel?: string },
    actor: ActorContext,
  ): Promise<ReactivatePooldataOptionResult> {
    await this.whitelistService.assertCategorical(columnName);
    const before = await this._findOptionOrFail(columnName, optionValue);

    const beforeSnapshot = this._toItem(before);

    before.is_active = true;
    before.deactivation_reason = null; // 啟用 → 清空原因
    if (input.optionLabel !== undefined) {
      before.option_label = input.optionLabel;
    }
    before.updated_at = new Date();
    const updated = await this.optionRepo.save(before);

    await this._writeAudit(
      actor,
      'UPDATE',
      columnName,
      optionValue,
      beforeSnapshot,
      this._toItem(updated),
    );

    return {
      columnName,
      optionValue: updated.option_value,
      optionLabel: updated.option_label,
      isActive: true,
    };
  }

  // ========================
  // F076 §5.4 — PATCH /pooldata-fields/:columnName/options/:optionValue/deactivate
  // ========================

  async deactivateOption(
    columnName: string,
    optionValue: string,
    input: { reason: string },
    actor: ActorContext,
  ): Promise<DeactivatePooldataOptionResult> {
    await this.whitelistService.assertCategorical(columnName);
    const before = await this._findOptionOrFail(columnName, optionValue);

    const beforeSnapshot = this._toItem(before);

    before.is_active = false;
    before.deactivation_reason = 'manual';
    before.updated_at = new Date();
    const updated = await this.optionRepo.save(before);

    await this._writeAudit(
      actor,
      'UPDATE',
      columnName,
      optionValue,
      beforeSnapshot,
      {
        ...this._toItem(updated),
        reason: input.reason,
        deactivationReason: 'manual',
      },
    );

    return {
      columnName,
      optionValue: updated.option_value,
      optionLabel: updated.option_label,
      isActive: false,
      deactivationReason: 'manual',
      reason: input.reason,
    };
  }

  // ========================
  // F076 §5.5 — PATCH /pooldata-fields/:columnName/options/reorder
  // ========================

  async reorderOptions(
    columnName: string,
    orderedValues: string[],
    actor: ActorContext,
  ): Promise<ListPooldataOptionsResult> {
    await this.whitelistService.assertCategorical(columnName);

    const rows = await this.optionRepo.find({ where: { column_name: columnName } });

    // 稽核 before：依「舊排序」（display_order, option_value）還原停用前的 optionValue 順序
    const previousOrder = [...rows]
      .sort((a, b) => {
        if (a.display_order !== b.display_order) {
          return a.display_order - b.display_order;
        }
        return a.option_value.localeCompare(b.option_value);
      })
      .map((r) => r.option_value);

    const rowsByValue = new Map(rows.map((r) => [r.option_value, r]));
    const now = new Date();
    const updatedRows: PooldataFieldOption[] = [];

    // display_order = 陣列索引；未列在 orderedValues 內的既有值維持原 display_order 不動
    // stale client 傳入不存在的 optionValue → 寬容跳過，不拋錯（避免 500）
    orderedValues.forEach((optionValue, index) => {
      const row = rowsByValue.get(optionValue);
      if (!row) {
        return;
      }
      row.display_order = index;
      row.updated_at = now;
      updatedRows.push(row);
    });

    if (updatedRows.length > 0) {
      await this.optionRepo.save(updatedRows);
    }

    await this._writeAudit(
      actor,
      'UPDATE',
      columnName,
      '__reorder__',
      { order: previousOrder },
      { order: orderedValues },
    );

    return this.listOptions(columnName, { includeInactive: 'true' });
  }

  // ========================
  // 內部 helper
  // ========================

  private async _findOptionOrFail(
    columnName: string,
    optionValue: string,
  ): Promise<PooldataFieldOption> {
    const row = await this.optionRepo.findOne({
      where: { column_name: columnName, option_value: optionValue },
    });
    if (!row) {
      throw new NotFoundException({
        error: ERROR_CODES.POOLDATA_OPTION_NOT_FOUND,
        message: ERROR_MESSAGES.POOLDATA_OPTION_NOT_FOUND,
      });
    }
    return row;
  }

  private _toItem(row: PooldataFieldOption): PooldataOptionItem {
    return {
      optionValue: row.option_value,
      optionLabel: row.option_label,
      displayOrder: row.display_order,
      isActive: row.is_active,
      deactivationReason: row.deactivation_reason,
    };
  }

  private async _writeAudit(
    actor: ActorContext,
    action: 'CREATE' | 'UPDATE',
    columnName: string,
    optionValue: string,
    beforeValue: Record<string, unknown> | PooldataOptionItem | null,
    afterValue: Record<string, unknown> | PooldataOptionItem | null,
  ): Promise<void> {
    try {
      const actorName = await this._resolveActorName(actor.userId);
      const log = this.auditRepo.create({
        entity_type: 'pooldata_field_option',
        entity_id: `${columnName}.${optionValue}`,
        action,
        actor_id: actor.userId,
        actor_name: actorName,
        before_value: beforeValue as Record<string, unknown> | null,
        after_value: afterValue as Record<string, unknown> | null,
        ip_address: actor.ipAddress ?? null,
      });
      await this.auditRepo.save(log);
    } catch (_err) {
      // BR-7 / 沿用 F050 v2.0 BR-11：稽核失敗不 rollback
    }
  }

  /**
   * F112 / AD-E07-47 §3.8：bulk 批次新增之**單一彙總**稽核紀錄（I-DVAL-AUDIT-SUMMARY-01）。
   *
   * 與既有單筆 `_writeAudit`（`entity_id = ${columnName}.${optionValue}`）刻意不同：此處 `entity_id = columnName`
   * （不含 `.optionValue` 後綴），且 spec §5.2/BR-13 之 `details` 對應至既有 `after_value` 欄位
   * （`AssignmentAuditLog` entity 無獨立 `details` 欄）。不逐筆各寫一筆。稽核失敗不 rollback（BR-7）。
   */
  private async _writeBulkAudit(
    actor: ActorContext,
    columnName: string,
    created: PooldataFieldOption[],
    skippedCount: number,
  ): Promise<void> {
    try {
      const actorName = await this._resolveActorName(actor.userId);
      const log = this.auditRepo.create({
        entity_type: 'pooldata_field_option',
        entity_id: columnName, // 彙總一筆：entity_id = columnName（非 columnName.optionValue）
        action: 'CREATE',
        actor_id: actor.userId,
        actor_name: actorName,
        before_value: null,
        after_value: {
          createdValues: created.map((r) => r.option_value),
          createdCount: created.length,
          skippedCount,
          source: 'bulk_auto_suggest',
        },
        ip_address: actor.ipAddress ?? null,
      });
      await this.auditRepo.save(log);
    } catch (_err) {
      // BR-7：稽核失敗不 rollback
    }
  }

  private async _resolveActorName(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name ?? 'unknown';
  }
}
