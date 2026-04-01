/**
 * LookupHandler
 * Enrich rows by looking up code→description from a reference table.
 *
 * Strategy: ALTER TABLE + UPDATE (in-place)
 *   Instead of CREATE TEMP TABLE AS SELECT ... LEFT JOIN (which copies ALL rows),
 *   we add columns to the existing temp table and UPDATE only matching rows.
 *   This avoids duplicating multi-million-row tables per lookup.
 *
 * Dual-input mode (preferred):
 *   - 'default' handle: main data stream
 *   - 'lookup-input' handle: lookup source (from upstream node, e.g. Filter)
 *
 * Legacy / fallback mode:
 *   - No 'lookup-input' connected → uses lookupSource (raw table name) + optional lookupFilter.
 */

import { NodeExecutor, NodeExecutionContext, DataSet, emptyDataSet } from '../types';

interface LookupOutputColumn {
  lookupColumn: string;
  outputAlias: string;
}

export class LookupHandler implements NodeExecutor {
  readonly nodeType = 'lookup';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    const mainInput = context.inputs['default'];
    if (!mainInput || mainInput.rowCount === 0) {
      return emptyDataSet();
    }

    const { data } = context.node;
    const matchColumn = data.matchColumn as string;
    const lookupMatchColumn = data.lookupMatchColumn as string;
    const outputColumns = (data.outputColumns as LookupOutputColumn[]) || [];
    const noMatchStrategy = (data.noMatchStrategy as string) || 'null';

    if (!matchColumn) throw new Error('Lookup 節點缺少比對欄位（主表）');
    if (!lookupMatchColumn) throw new Error('Lookup 節點缺少比對欄位（對照表）');
    if (outputColumns.length === 0) throw new Error('Lookup 節點缺少輸出欄位');

    // Determine lookup table: dual-input mode vs legacy mode
    const lookupInput = context.inputs['lookup-input'];
    const lookupSource = data.lookupSource as string;
    const lookupFilter = (data.lookupFilter as string) || '';

    const lookupTable = lookupInput?.tempTable || lookupSource;

    if (!lookupTable) throw new Error('Lookup 節點缺少對照來源');

    // In legacy mode (no lookup-input), validate the raw table exists
    if (!lookupInput) {
      const tableCheck = await context.queryRunner.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
        [lookupTable],
      );
      if (!tableCheck || tableCheck.length === 0) {
        throw new Error(`對照表 ${lookupTable} 不存在`);
      }
    }

    const inputTable = mainInput.tempTable;

    // Build lookup sub-query (with optional filter for legacy mode)
    // Note: PostgreSQL uses hash join for large-table × small-table, no index needed
    let lookupSubQuery = `SELECT * FROM "${lookupTable}"`;
    if (!lookupInput && lookupFilter.trim()) {
      lookupSubQuery += ` WHERE ${lookupFilter}`;
    }

    if (noMatchStrategy === 'skip_row') {
      // INNER JOIN semantics: must delete non-matching rows.
      // Use DELETE ... WHERE NOT EXISTS for efficiency.
      // First add columns, then update, then delete non-matching.
      for (const col of outputColumns) {
        const alias = col.outputAlias || col.lookupColumn;
        await context.queryRunner.query(
          `ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${alias}" TEXT`,
        );
      }

      // UPDATE matching rows
      const setClauses = outputColumns.map((col) => {
        const alias = col.outputAlias || col.lookupColumn;
        return `"${alias}" = _lk."${col.lookupColumn}"`;
      });
      await context.queryRunner.query(
        `UPDATE "${inputTable}" _src SET ${setClauses.join(', ')} FROM (${lookupSubQuery}) _lk WHERE _src."${matchColumn}" = _lk."${lookupMatchColumn}"`,
      );

      // DELETE rows with no match
      await context.queryRunner.query(
        `DELETE FROM "${inputTable}" _src WHERE NOT EXISTS (SELECT 1 FROM (${lookupSubQuery}) _lk WHERE _src."${matchColumn}" = _lk."${lookupMatchColumn}")`,
      );
    } else {
      // LEFT JOIN semantics (null / default_value): add columns and update in-place
      for (const col of outputColumns) {
        const alias = col.outputAlias || col.lookupColumn;
        await context.queryRunner.query(
          `ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${alias}" TEXT`,
        );
      }

      // UPDATE only matching rows; non-matching rows keep NULL (LEFT JOIN semantics)
      const setClauses = outputColumns.map((col) => {
        const alias = col.outputAlias || col.lookupColumn;
        return `"${alias}" = _lk."${col.lookupColumn}"`;
      });
      await context.queryRunner.query(
        `UPDATE "${inputTable}" _src SET ${setClauses.join(', ')} FROM (${lookupSubQuery}) _lk WHERE _src."${matchColumn}" = _lk."${lookupMatchColumn}"`,
      );

      // Handle default_value strategy: fill NULLs with the default
      if (noMatchStrategy === 'default_value') {
        const defaultValue = (data.defaultValue as string) || '';
        for (const col of outputColumns) {
          const alias = col.outputAlias || col.lookupColumn;
          await context.queryRunner.query(
            `UPDATE "${inputTable}" SET "${alias}" = $1 WHERE "${alias}" IS NULL`,
            [defaultValue],
          );
        }
      }
    }

    // Row count (may have changed if skip_row deleted rows)
    const countResult = await context.queryRunner.query(
      `SELECT COUNT(*)::int AS cnt FROM "${inputTable}"`,
    );
    const rowCount = countResult[0]?.cnt ?? 0;

    // Return the SAME temp table (in-place modification, no new table created)
    return { tempTable: inputTable, rowCount };
  }
}
