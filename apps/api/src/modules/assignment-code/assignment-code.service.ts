import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CreateCodeDto } from './dto/create-code.dto';
import { UpdateCodeDto } from './dto/update-code.dto';

/**
 * F068：E07 代碼維護 Service
 *
 * 範圍嚴格限定 3 類代碼（BR-1）：
 *   - PROD_KIND   產品類別
 *   - SPEC_TP     專案類別
 *   - CASE_STATUS 案件結清期別
 *
 * 其他 tbl_id（含 CASEYEAR，屬前端 hard-coded）一律拋 CODE_TYPE_INVALID。
 *
 * 商業規則：
 *   - BR-2 啟用狀態以 stadt <= TODAY <= enddt 判斷（OQ-F068-05 Asia/Taipei 基準日）
 *   - BR-3 唯一性檢查範圍：同 tbl_id 下啟用期間紀錄
 *   - BR-4 停用不回溯修改既有 ob_list_definition
 *   - system_id 固定 'OB'（OQ-E07-11）
 *   - 寫入 assignment_audit_log（actor_id = req.user.userId，OQ-F068-04）
 *   - 停用：enddt = today (Asia/Taipei YYYYMMDD)（OQ-F068-03）
 */
export const ALLOWED_TBL_IDS = ['PROD_KIND', 'SPEC_TP', 'CASE_STATUS'] as const;
export type AllowedTblId = (typeof ALLOWED_TBL_IDS)[number];

export const SYSTEM_ID = 'OB';
export const ENDDT_INFINITE = '99991231';

export interface ActorContext {
  userId: string;
  /** Optional override for ip address (controller fills from req.ip) */
  ipAddress?: string | null;
}

export interface AssignmentCodeItem {
  tblCd: string;
  tblDesc1: string | null;
  tblDesc2: string | null;
  stadt: string | null;
  enddt: string | null;
  active: boolean;
}

export interface ListCodesResult {
  tblId: AllowedTblId;
  data: AssignmentCodeItem[];
}

@Injectable()
export class AssignmentCodeService {
  constructor(
    @InjectRepository(ObCodeDf)
    private readonly codeRepo: Repository<ObCodeDf>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ============== Public API ==============

  async listCodes(
    tblId: string,
    includeInactive: boolean,
  ): Promise<ListCodesResult> {
    const allowedTblId = this.assertAllowedTblId(tblId);
    const today = AssignmentCodeService.getTodayYmdInTaipei();

    const all = await this.codeRepo.find({
      where: { system_id: SYSTEM_ID, tbl_id: allowedTblId },
    });

    const data = all
      .map((row) => this.toItem(row, today))
      .filter((item) => includeInactive || item.active);

    return { tblId: allowedTblId, data };
  }

  async createCode(
    dto: CreateCodeDto,
    actor: ActorContext,
  ): Promise<AssignmentCodeItem> {
    const allowedTblId = this.assertAllowedTblId(dto.tblId);
    const today = AssignmentCodeService.getTodayYmdInTaipei();
    const stadt = dto.stadt ?? today;
    const enddt = dto.enddt ?? ENDDT_INFINITE;

    // BR-3：同 tbl_id 下啟用期間紀錄不可重複 tbl_cd
    await this.assertTblCdUnique(allowedTblId, dto.tblCd, today);

    const entity = this.codeRepo.create({
      system_id: SYSTEM_ID,
      tbl_id: allowedTblId,
      tbl_cd: dto.tblCd,
      tbl_desc1: dto.tblDesc1,
      tbl_desc2: dto.tblDesc2 ?? null,
      stadt,
      enddt,
    });
    const saved = await this.codeRepo.save(entity);

    await this.writeAudit(actor, 'CREATE', allowedTblId, dto.tblCd, null, {
      tbl_desc1: saved.tbl_desc1,
      tbl_desc2: saved.tbl_desc2,
      stadt: saved.stadt,
      enddt: saved.enddt,
    });

    return this.toItem(saved, today);
  }

  async updateCode(
    tblId: string,
    tblCd: string,
    dto: UpdateCodeDto,
    actor: ActorContext,
  ): Promise<AssignmentCodeItem> {
    const allowedTblId = this.assertAllowedTblId(tblId);
    const today = AssignmentCodeService.getTodayYmdInTaipei();

    const existing = await this.findOrFail(allowedTblId, tblCd);
    const before = {
      tbl_desc1: existing.tbl_desc1,
      tbl_desc2: existing.tbl_desc2,
      stadt: existing.stadt,
      enddt: existing.enddt,
    };

    existing.tbl_desc1 = dto.tblDesc1;
    existing.tbl_desc2 = dto.tblDesc2 ?? null;
    const saved = await this.codeRepo.save(existing);

    await this.writeAudit(actor, 'UPDATE', allowedTblId, tblCd, before, {
      tbl_desc1: saved.tbl_desc1,
      tbl_desc2: saved.tbl_desc2,
      stadt: saved.stadt,
      enddt: saved.enddt,
    });

    return this.toItem(saved, today);
  }

  async disableCode(
    tblId: string,
    tblCd: string,
    actor: ActorContext,
  ): Promise<AssignmentCodeItem> {
    const allowedTblId = this.assertAllowedTblId(tblId);
    const today = AssignmentCodeService.getTodayYmdInTaipei();

    const existing = await this.findOrFail(allowedTblId, tblCd);
    const before = {
      tbl_desc1: existing.tbl_desc1,
      tbl_desc2: existing.tbl_desc2,
      stadt: existing.stadt,
      enddt: existing.enddt,
    };

    // OQ-F068-03：停用 enddt 設為當日（YYYYMMDD Asia/Taipei）
    existing.enddt = today;
    const saved = await this.codeRepo.save(existing);

    // action = 'DISABLE'（spec AC-4）。entity 型別僅 CREATE/UPDATE/DELETE/RUN，
    // 為對齊 spec 行為使用 cast；DB schema varchar(10) 容許。
    await this.writeAudit(
      actor,
      'DISABLE' as 'DELETE',
      allowedTblId,
      tblCd,
      before,
      {
        tbl_desc1: saved.tbl_desc1,
        tbl_desc2: saved.tbl_desc2,
        stadt: saved.stadt,
        enddt: saved.enddt,
      },
    );

    return this.toItem(saved, today);
  }

  // ============== Private helpers ==============

  /**
   * 驗證 tbl_id 在白名單內；CASEYEAR 與其他值一律拋 CODE_TYPE_INVALID。
   */
  private assertAllowedTblId(tblId: string): AllowedTblId {
    if (!ALLOWED_TBL_IDS.includes(tblId as AllowedTblId)) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.CODE_TYPE_INVALID,
        message: ERROR_MESSAGES.CODE_TYPE_INVALID,
      });
    }
    return tblId as AllowedTblId;
  }

  private async assertTblCdUnique(
    tblId: AllowedTblId,
    tblCd: string,
    today: string,
  ): Promise<void> {
    const existing = await this.codeRepo.findOne({
      where: { system_id: SYSTEM_ID, tbl_id: tblId, tbl_cd: tblCd },
    });
    if (!existing) return;
    // BR-3：唯一性檢查範圍限「啟用期間紀錄」。
    // 若 existing 已過期，仍視為「PK 衝突」拒絕新增（同 PK 不可寫 2 列）。
    // 規格在 BR-3 寫「啟用期間」，但實作層面 PK 衝突必拒；統一回 CODE_IN_USE 訊息。
    const isActive = AssignmentCodeService.isActive(existing, today);
    if (isActive || !isActive) {
      // 訊息 placeholder 填值
      const message = ERROR_MESSAGES.CODE_IN_USE.replace('{tblCd}', tblCd).replace(
        '{tblId}',
        tblId,
      );
      throw new UnprocessableEntityException({
        error: ERROR_CODES.CODE_IN_USE,
        message,
      });
    }
  }

  private async findOrFail(
    tblId: AllowedTblId,
    tblCd: string,
  ): Promise<ObCodeDf> {
    const found = await this.codeRepo.findOne({
      where: { system_id: SYSTEM_ID, tbl_id: tblId, tbl_cd: tblCd },
    });
    if (!found) {
      throw new NotFoundException({
        error: ERROR_CODES.CODE_NOT_FOUND,
        message: ERROR_MESSAGES.CODE_NOT_FOUND,
      });
    }
    return found;
  }

  private async writeAudit(
    actor: ActorContext,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    tblId: AllowedTblId,
    tblCd: string,
    beforeValue: Record<string, unknown> | null,
    afterValue: Record<string, unknown> | null,
  ): Promise<void> {
    // OQ-F068-04：actor_id 為 req.user.userId；actor_name 反查 User.name
    const actorName = await this.resolveActorName(actor.userId);
    const log = this.auditRepo.create({
      entity_type: 'ob_code_df',
      entity_id: `${tblId}:${tblCd}`,
      action: action,
      actor_id: actor.userId,
      actor_name: actorName,
      before_value: beforeValue,
      after_value: afterValue,
      ip_address: actor.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  private async resolveActorName(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name'],
    });
    return user?.name ?? 'unknown';
  }

  // ============== Static helpers ==============

  /**
   * 取得 Asia/Taipei 今日 YYYYMMDD（OQ-F068-05）
   *
   * 不依賴 Intl 時區資料庫的精確輸出格式：
   *   - 採 UTC + 8 小時 offset 對齊台北日曆日。
   *   - 台北無 DST，常年 +08:00。
   */
  static getTodayYmdInTaipei(now: Date = new Date()): string {
    const utcMs = now.getTime();
    const taipeiMs = utcMs + 8 * 60 * 60 * 1000;
    const taipei = new Date(taipeiMs);
    const yyyy = taipei.getUTCFullYear().toString().padStart(4, '0');
    const mm = (taipei.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = taipei.getUTCDate().toString().padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  /**
   * BR-2：active 判定 stadt <= today <= enddt。
   * null stadt 視為 -infinity；null enddt 視為 +infinity。
   */
  static isActive(row: Pick<ObCodeDf, 'stadt' | 'enddt'>, today: string): boolean {
    const stadt = row.stadt ?? '';
    const enddt = row.enddt ?? '99999999';
    if (stadt && stadt > today) return false;
    if (enddt && enddt < today) return false;
    return true;
  }

  private toItem(row: ObCodeDf, today: string): AssignmentCodeItem {
    return {
      tblCd: row.tbl_cd,
      tblDesc1: row.tbl_desc1,
      tblDesc2: row.tbl_desc2,
      stadt: row.stadt,
      enddt: row.enddt,
      active: AssignmentCodeService.isActive(row, today),
    };
  }
}
