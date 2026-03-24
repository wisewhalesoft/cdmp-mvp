import { describe, it, expect, vi, afterEach } from 'vitest';
import { injectEtlTrackingFields } from '../etl-tracking.util';

describe('injectEtlTrackingFields', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TS-F036-018 (unit level): tracking fields are not null
  it('should return non-null tracking fields when context is complete', () => {
    const pipelineId = '550e8400-e29b-41d4-a716-446655440000';
    const dataSourceName = 'test-datasource';

    const result = injectEtlTrackingFields({ pipelineId, dataSourceName });

    expect(result.data_source).toBe('test-datasource');
    expect(result._etl_loaded_at).toBeInstanceOf(Date);
    expect(result._etl_pipeline_id).toBe(pipelineId);
  });

  // TS-F036-019 (unit level): timestamp is reasonable
  it('should produce _etl_loaded_at between before and after call time', () => {
    const before = new Date();
    const result = injectEtlTrackingFields({
      pipelineId: '550e8400-e29b-41d4-a716-446655440000',
      dataSourceName: 'ds',
    });
    const after = new Date();

    expect(result._etl_loaded_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result._etl_loaded_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should set data_source to null when dataSourceName is not provided', () => {
    const result = injectEtlTrackingFields({
      pipelineId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.data_source).toBeNull();
    expect(result._etl_pipeline_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result._etl_loaded_at).toBeInstanceOf(Date);
  });
});
