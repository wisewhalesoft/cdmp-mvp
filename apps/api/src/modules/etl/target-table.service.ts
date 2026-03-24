import { Injectable, NotFoundException } from '@nestjs/common';
import { TARGET_TABLE_SCHEMAS, TargetTableSchema, TargetTableSummary } from './target-table-schemas';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

@Injectable()
export class TargetTableService {
  getAll(): { data: TargetTableSummary[] } {
    const data: TargetTableSummary[] = TARGET_TABLE_SCHEMAS.map((t) => ({
      tableName: t.tableName,
      displayName: t.displayName,
      domain: t.domain,
      columnCount: t.columns.length,
      description: t.description,
    }));
    return { data };
  }

  getSchema(tableName: string): TargetTableSchema {
    const schema = TARGET_TABLE_SCHEMAS.find((t) => t.tableName === tableName);
    if (!schema) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_TARGET_TABLE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_TARGET_TABLE_NOT_FOUND,
      });
    }
    return schema;
  }
}
