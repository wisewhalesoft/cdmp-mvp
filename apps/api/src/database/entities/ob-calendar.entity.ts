// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBCALENDAR.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('ob_calendar')
export class ObCalendar {
  @PrimaryColumn({ name: 'calendar_date', type: 'date' })
  calendar_date: Date;

  // 與 migration 一致：source SQL Server 為 int，spec 用 varchar(1) ('0'=工作日 / '1'=假日）
  @Column({ name: 'rest_flg', type: 'varchar', length: 1 })
  rest_flg: string;
}
