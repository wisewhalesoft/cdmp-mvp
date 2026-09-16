import { describe, it, expect } from 'vitest';
import { formatCronTW } from '../cron-utils';

describe('cron-utils', () => {
  describe('formatCronTW', () => {
    it('每日固定時刻（整點）', () => {
      expect(formatCronTW('0 2 * * *')).toBe('每日 02:00 (UTC+8)');
    });

    it('每日固定時刻（非整點，時分補零兩位）', () => {
      expect(formatCronTW('30 9 * * *')).toBe('每日 09:30 (UTC+8)');
    });

    it('每小時整點', () => {
      expect(formatCronTW('0 * * * *')).toBe('每小時 00 分 (UTC+8)');
    });

    it('每小時指定分鐘', () => {
      expect(formatCronTW('15 * * * *')).toBe('每小時 15 分 (UTC+8)');
    });

    it('每 N 小時', () => {
      expect(formatCronTW('0 */6 * * *')).toBe('每 6 小時 (UTC+8)');
    });

    it('每週單日', () => {
      expect(formatCronTW('0 3 * * 1')).toBe('每週一 03:00 (UTC+8)');
    });

    it('週一至週五', () => {
      expect(formatCronTW('0 9 * * 1-5')).toBe('週一至週五 09:00 (UTC+8)');
    });

    it('週末（0,6 順序）', () => {
      expect(formatCronTW('0 9 * * 0,6')).toBe('週六、日 09:00 (UTC+8)');
    });

    it('週末（6,0 順序）', () => {
      expect(formatCronTW('0 9 * * 6,0')).toBe('週六、日 09:00 (UTC+8)');
    });

    // 擷取任務表單的「每週」是多選：selectedWeekdays.join(',')
    // （add-extraction-task-page.tsx:198），因此清單／範圍都是 UI 產得出來的排程。
    it('星期清單以「、」相連', () => {
      expect(formatCronTW('0 9 * * 1,3,5')).toBe('週一、週三、週五 09:00 (UTC+8)');
    });

    it('星期兩段清單', () => {
      expect(formatCronTW('0 9 * * 2,4')).toBe('週二、週四 09:00 (UTC+8)');
    });

    it('通用星期範圍', () => {
      expect(formatCronTW('0 9 * * 2-4')).toBe('週二至週四 09:00 (UTC+8)');
    });

    it('星期範圍與單日混用', () => {
      expect(formatCronTW('0 9 * * 1-3,5')).toBe('週一至週三、週五 09:00 (UTC+8)');
    });

    it('含週日的清單（非 0,6 特例）', () => {
      expect(formatCronTW('0 9 * * 0,3')).toBe('週日、週三 09:00 (UTC+8)');
    });

    it('星期越界（7）整條 fallback', () => {
      expect(formatCronTW('0 9 * * 7')).toBe('0 9 * * 7');
    });

    it('清單中任一段越界即整條 fallback', () => {
      expect(formatCronTW('0 9 * * 1,7')).toBe('0 9 * * 1,7');
    });

    it('範圍端點越界即整條 fallback', () => {
      expect(formatCronTW('0 9 * * 1-8')).toBe('0 9 * * 1-8');
    });

    it('星期用英文縮寫時 fallback', () => {
      expect(formatCronTW('0 9 * * MON')).toBe('0 9 * * MON');
    });

    it('每月指定日', () => {
      expect(formatCronTW('0 1 1 * *')).toBe('每月 1 日 01:00 (UTC+8)');
    });

    it('null 回傳 -', () => {
      expect(formatCronTW(null)).toBe('-');
    });

    it('undefined 回傳 -', () => {
      expect(formatCronTW(undefined)).toBe('-');
    });

    it('空白字串回傳 -', () => {
      expect(formatCronTW('   ')).toBe('-');
    });

    it('空字串回傳 -', () => {
      expect(formatCronTW('')).toBe('-');
    });

    it('無法解析（日期欄含步進）原樣回傳修剪後字串，不加 (UTC+8)', () => {
      expect(formatCronTW('0 2 */3 * *')).toBe('0 2 */3 * *');
    });

    it('欄數不足時原樣回傳修剪後字串', () => {
      expect(formatCronTW('  0 2 * *  ')).toBe('0 2 * *');
    });

    it('欄數過多時原樣回傳修剪後字串', () => {
      expect(formatCronTW('0 2 * * * *')).toBe('0 2 * * * *');
    });

    it('時分非數字時原樣回傳', () => {
      expect(formatCronTW('*/5 2 * * *')).toBe('*/5 2 * * *');
    });

    it('星期欄含步進等未支援語法時原樣回傳', () => {
      expect(formatCronTW('0 9 * * */2')).toBe('0 9 * * */2');
    });

    it('修剪前後空白後仍可解析', () => {
      expect(formatCronTW('  0 2 * * *  ')).toBe('每日 02:00 (UTC+8)');
    });

    it('純函式：同一輸入多次呼叫結果一致', () => {
      expect(formatCronTW('0 2 * * *')).toBe(formatCronTW('0 2 * * *'));
    });

    // 清單欄的文案與表單 builder 預覽（create-pipeline-modal 的 describeCron、
    // add/edit-extraction-task-page 的 cronToReadable）刻意不同：清單欄要短、
    // 預覽是完整句。此處只驗清單欄自身契約，不與預覽文案互相比對。
    const PARSEABLE_CRONS = [
      '0 2 * * *',
      '30 9 * * *',
      '0 * * * *',
      '15 * * * *',
      '0 */6 * * *',
      '0 3 * * 1',
      '0 9 * * 1-5',
      '0 9 * * 0,6',
      '0 9 * * 1,3,5',
      '0 9 * * 2-4',
      '0 1 1 * *',
    ];

    it.each(PARSEABLE_CRONS)('可解析的 %s 以 " (UTC+8)" 結尾', (expr) => {
      expect(formatCronTW(expr).endsWith(' (UTC+8)')).toBe(true);
    });

    it.each(PARSEABLE_CRONS)('%s 不含裸 UTC（只允許 UTC+8）', (expr) => {
      expect(formatCronTW(expr)).not.toMatch(/UTC(?!\+8)/);
    });

    it('無法解析時完全不出現 UTC 字樣', () => {
      expect(formatCronTW('0 2 */3 * *')).not.toMatch(/UTC/);
      expect(formatCronTW('*/5 2 * * *')).not.toMatch(/UTC/);
    });

    it('可解析輸出結尾不帶「執行」二字', () => {
      for (const expr of PARSEABLE_CRONS) {
        expect(formatCronTW(expr)).not.toContain('執行');
      }
    });
  });
});
