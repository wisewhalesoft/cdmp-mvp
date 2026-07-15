import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TargetTableService } from '../target-table.service';

describe('TargetTableService', () => {
  const service = new TargetTableService();

  describe('getAll()', () => {
    it('TS-F036-001: should return 2 target tables (customer_core + customer_financial)', () => {
      const result = service.getAll();
      const names = result.data.map((t) => t.tableName);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].tableName).toBe('customer_core');
      expect(names).toContain('customer_financial'); // F114
    });

    it('should not contain Phase 2/3 placeholder tables', () => {
      const result = service.getAll();
      const names = result.data.map((t) => t.tableName);
      // customer_financial 已於 F114 實作為正式目標表，不再是佔位表
      expect(names).not.toContain('customer_interaction');
      expect(names).not.toContain('customer_service');
    });

    it('TS-F036-002: each item has exactly 5 properties with correct types', () => {
      const result = service.getAll();
      for (const item of result.data) {
        expect(Object.keys(item)).toHaveLength(5);
        expect(typeof item.tableName).toBe('string');
        expect(typeof item.displayName).toBe('string');
        expect(typeof item.domain).toBe('string');
        expect(typeof item.columnCount).toBe('number');
        expect(typeof item.description).toBe('string');
        // Values are non-empty
        expect(item.tableName.length).toBeGreaterThan(0);
        expect(item.displayName.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      }
    });

    it('TS-F036-003: columnCount matches actual columns.length and domain is core', () => {
      const result = service.getAll();
      const core = result.data[0];
      expect(core.domain).toBe('core');
      expect(core.columnCount).toBe(85); // A~H: 6+13+10+10+12+14+15+5
      expect(core.displayName).toContain('Customer Core');
    });
  });

  describe('getSchema()', () => {
    it('should return customer_core schema with correct columns length', () => {
      const schema = service.getSchema('customer_core');
      expect(schema.tableName).toBe('customer_core');
      expect(schema.columns).toHaveLength(85);
    });

    it('TS-F036-012: should throw NotFoundException for unknown table', () => {
      expect(() => service.getSchema('customer_unknown')).toThrow(NotFoundException);
    });

    it('TS-F036-013: should throw NotFoundException for Phase 2/3 tables', () => {
      expect(() => service.getSchema('customer_interaction')).toThrow(NotFoundException);
      expect(() => service.getSchema('customer_service')).toThrow(NotFoundException);
    });

    it('should include correct error code in NotFoundException', () => {
      try {
        service.getSchema('customer_unknown');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          error: 'PIPELINE_TARGET_TABLE_NOT_FOUND',
          message: '找不到指定的目標表',
        });
      }
    });
  });
});
