/**
 * F036: ETL 追蹤欄位自動填充工具函式
 * 用於 Load 節點寫入目標表時，自動注入追蹤欄位值
 */

export interface EtlTrackingContext {
  pipelineId: string;
  dataSourceName?: string;
}

export interface EtlTrackingFields {
  data_source: string | null;
  _etl_loaded_at: Date;
  _etl_pipeline_id: string;
}

/**
 * 產生 ETL 追蹤欄位值，供 Load 節點注入到寫入資料中
 */
export function injectEtlTrackingFields(context: EtlTrackingContext): EtlTrackingFields {
  return {
    data_source: context.dataSourceName ?? null,
    _etl_loaded_at: new Date(),
    _etl_pipeline_id: context.pipelineId,
  };
}
