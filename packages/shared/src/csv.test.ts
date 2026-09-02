import { describe, expect, it } from 'vitest';
import { escapeCsvValue, toCsv } from './csv.js';

describe('escapeCsvValue', () => {
  it('quotes everything, so there is one rule rather than a list of exceptions', () => {
    expect(escapeCsvValue('Coffee')).toBe('"Coffee"');
    expect(escapeCsvValue(1234)).toBe('"1234"');
  });

  it('does not let a comma or a newline invent a column or a row', () => {
    expect(escapeCsvValue('Lunch, tip included')).toBe('"Lunch, tip included"');
    expect(escapeCsvValue('two\nlines')).toBe('"two\nlines"');
  });

  it('doubles an embedded quote rather than ending the field early', () => {
    expect(escapeCsvValue('a "quoted" word')).toBe('"a ""quoted"" word"');
  });

  /**
   * The one that matters. A spreadsheet executes a cell starting with `=`, `+`,
   * `-` or `@`, so a description is an injection vector the moment the file is
   * opened - and descriptions can come from a receipt the model read, not only
   * from something the user typed themselves.
   */
  it('defuses a formula so a spreadsheet renders it as text', () => {
    expect(escapeCsvValue('=HYPERLINK("http://evil","Click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""Click"")"',
    );
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      expect(escapeCsvValue(`${prefix}SUM(A1:A9)`).startsWith(`"'${prefix}`)).toBe(true);
    }
  });

  it('leaves an ordinary leading character alone', () => {
    expect(escapeCsvValue('Groceries')).toBe('"Groceries"');
    // A negative amount is the interesting case: it legitimately starts with `-`,
    // so it is defused too. Correctness beats tidiness - the cell still reads
    // as -12.50, and a spreadsheet that evaluated it would show the same number.
    expect(escapeCsvValue('-12.50')).toBe('"\'-12.50"');
  });
});

describe('toCsv', () => {
  it('writes a header row and CRLF line endings per RFC 4180', () => {
    const csv = toCsv(['Date', 'Amount'], [['2026-08-14', '12.50']]);
    expect(csv).toBe('"Date","Amount"\r\n"2026-08-14","12.50"\r\n');
  });

  it('produces just a terminated header when there is nothing to export', () => {
    expect(toCsv(['Date'], [])).toBe('"Date"\r\n');
  });
});
