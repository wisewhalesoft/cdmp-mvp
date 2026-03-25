import { describe, it, expect } from 'vitest';
import {
  mergePhone,
  toDecimal,
  mapCustomerType,
  lookupCodeDescription,
} from '../etl-transforms';

// Step 6: mergePhone
describe('mergePhone', () => {
  it('TS-F036-018: normal merge ("02", "27123456") -> "02-27123456"', () => {
    expect(mergePhone('02', '27123456')).toBe('02-27123456');
  });

  it('TS-F036-018: normal merge ("04", "23456789") -> "04-23456789"', () => {
    expect(mergePhone('04', '23456789')).toBe('04-23456789');
  });

  it('TS-F036-019: placeholder "00-0000000000" -> null', () => {
    expect(mergePhone('00', '0000000000')).toBeNull();
  });

  it('TS-F036-020: area code all zeros -> null', () => {
    expect(mergePhone('00', '27123456')).toBeNull();
  });

  it('TS-F036-020: tel number all zeros -> null', () => {
    expect(mergePhone('02', '00000000')).toBeNull();
  });

  it('TS-F036-020: both all zeros -> null', () => {
    expect(mergePhone('000', '0000000')).toBeNull();
  });

  it('TS-F036-021: null area code -> null', () => {
    expect(mergePhone(null, '27123456')).toBeNull();
  });

  it('TS-F036-021: null tel number -> null', () => {
    expect(mergePhone('02', null)).toBeNull();
  });

  it('TS-F036-021: both null -> null', () => {
    expect(mergePhone(null, null)).toBeNull();
  });

  it('TS-F036-021: empty strings -> null', () => {
    expect(mergePhone('', '')).toBeNull();
  });

  it('TS-F036-021: area code empty -> null', () => {
    expect(mergePhone('', '27123456')).toBeNull();
  });

  it('TS-F036-021: tel number empty -> null', () => {
    expect(mergePhone('02', '')).toBeNull();
  });
});

// Step 7: toDecimal
describe('toDecimal', () => {
  it('TS-F036-022: "5000000" -> 5000000', () => {
    expect(toDecimal('5000000')).toBe(5000000);
  });

  it('TS-F036-022: "12500000.50" -> 12500000.5', () => {
    expect(toDecimal('12500000.50')).toBe(12500000.5);
  });

  it('TS-F036-022: "0" -> 0', () => {
    expect(toDecimal('0')).toBe(0);
  });

  it('TS-F036-023: "ABC" -> null', () => {
    expect(toDecimal('ABC')).toBeNull();
  });

  it('TS-F036-023: "" -> null', () => {
    expect(toDecimal('')).toBeNull();
  });

  it('TS-F036-023: null -> null', () => {
    expect(toDecimal(null)).toBeNull();
  });

  it('negative number "-100.5" -> -100.5', () => {
    expect(toDecimal('-100.5')).toBe(-100.5);
  });
});

// Step 8: mapCustomerType
describe('mapCustomerType', () => {
  it('TS-F036-024: MLMC "1" -> "01"', () => {
    expect(mapCustomerType('MLMC', '1')).toBe('01');
  });

  it('TS-F036-024: MLMC "2" -> "02"', () => {
    expect(mapCustomerType('MLMC', '2')).toBe('02');
  });

  it('TS-F036-025: ZZIP "01" -> "01"', () => {
    expect(mapCustomerType('ZZIP', '01')).toBe('01');
  });

  it('TS-F036-025: ZZIP "02" -> "02"', () => {
    expect(mapCustomerType('ZZIP', '02')).toBe('02');
  });

  it('TS-F036-025: ZZIP "04" -> "04"', () => {
    expect(mapCustomerType('ZZIP', '04')).toBe('04');
  });

  it('MLMC "3" -> "03" (padStart)', () => {
    expect(mapCustomerType('MLMC', '3')).toBe('03');
  });
});

// Step 10: lookupCodeDescription
describe('lookupCodeDescription', () => {
  const educationTable = new Map([
    ['01', '國小'],
    ['02', '國中'],
    ['03', '高中'],
    ['04', '大學'],
    ['05', '碩士'],
  ]);

  it('TS-F036-026: education_code "03" -> code preserved, desc from lookup', () => {
    const result = lookupCodeDescription('education', '03', educationTable);
    expect(result.code).toBe('03');
    expect(result.desc).toBe('高中');
  });

  it('TS-F036-026: education_code "05" -> desc "碩士"', () => {
    const result = lookupCodeDescription('education', '05', educationTable);
    expect(result.code).toBe('05');
    expect(result.desc).toBe('碩士');
  });

  it('TS-F036-027: unknown code "XXXX" -> code preserved, desc null', () => {
    const result = lookupCodeDescription('occupation', 'XXXX', new Map());
    expect(result.code).toBe('XXXX');
    expect(result.desc).toBeNull();
  });

  it('TS-F036-027: code not in table -> desc null', () => {
    const result = lookupCodeDescription('education', '99', educationTable);
    expect(result.code).toBe('99');
    expect(result.desc).toBeNull();
  });
});
