import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * LegacyDetectionService（AD-E07 v3.0 / 決議 #T2 / 2026-05-16）
 *
 * 啟動時偵測 legacy E07 資料殘留並提示維運人員。**不阻擋啟動**：偵測異常時
 * 僅 logger.warn，由維運判斷後續是否需手動清理 / Admin 重新指派業務角色。
 *
 * 偵測項目：
 *   1. `users.is_sales_manager = true` 仍存在筆數（m14 之後 column 應已 DROP；
 *      但若 m14 尚未上線、或某環境誤 rollback，可早期警示）
 *   2. `users.business_role` 為非允許值（'director' / 'section_chief' / NULL 以外）筆數
 *      （DB CHECK 應已攔截；偵測作為雙層保護）
 *
 * 失敗策略：column / table 不存在 → 視為已正確 DROP，logger.log 正常訊息。
 */
@Injectable()
export class LegacyDetectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyDetectionService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkLegacyIsSalesManager();
    await this.checkInvalidBusinessRole();
  }

  private async checkLegacyIsSalesManager(): Promise<void> {
    try {
      const rows = await this.dataSource.query(
        `SELECT COUNT(*) AS count FROM users WHERE is_sales_manager = TRUE`,
      );
      const count = Number(rows?.[0]?.count ?? 0);
      if (count > 0) {
        this.logger.warn(
          `Legacy detection: ${count} 筆 users.is_sales_manager=true 殘留；` +
            `建議透過 F006a 重新指派 business_role 後執行 m14 DROP COLUMN`,
        );
      } else {
        this.logger.log('Legacy detection: users.is_sales_manager 無殘留紀錄');
      }
    } catch (e: any) {
      // column 不存在 = m14 已完成 DROP，視為正常
      this.logger.log(
        `Legacy detection: users.is_sales_manager column 不存在或無法查詢（${e?.message ?? e}），視為 m14 已執行完畢`,
      );
    }
  }

  private async checkInvalidBusinessRole(): Promise<void> {
    try {
      const rows = await this.dataSource.query(
        `SELECT COUNT(*) AS count FROM users
         WHERE business_role IS NOT NULL
           AND business_role NOT IN ('director', 'section_chief')`,
      );
      const count = Number(rows?.[0]?.count ?? 0);
      if (count > 0) {
        this.logger.warn(
          `Legacy detection: ${count} 筆 users.business_role invalid 值（非允許值）；` +
            `應由 DB CHECK constraint 攔截，請檢查 m14 是否完整執行`,
        );
      } else {
        this.logger.log('Legacy detection: users.business_role 值符合允許列表');
      }
    } catch (e: any) {
      this.logger.log(
        `Legacy detection: users.business_role column 不存在或無法查詢（${e?.message ?? e}），m14 未執行或環境不支援`,
      );
    }
  }
}
