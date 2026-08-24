import {
  formatTransactionNumber,
  parseSequence,
  transactionNumberPrefix,
} from '../constants/transaction-number';

describe('transaction numbers', () => {
  it('formats as RE-YYYY-NNNN, zero-padded so numbers sort lexically', () => {
    expect(formatTransactionNumber(2026, 1)).toBe('RE-2026-0001');
    expect(formatTransactionNumber(2026, 42)).toBe('RE-2026-0042');
    expect(formatTransactionNumber(2026, 9999)).toBe('RE-2026-9999');
  });

  it('sorts lexically in sequence order — the allocator reads the max by ORDER BY', () => {
    const numbers = [1, 2, 9, 10, 99, 100, 1000].map((n) => formatTransactionNumber(2026, n));
    expect([...numbers].sort()).toEqual(numbers);
  });

  it('round-trips through parseSequence', () => {
    for (const sequence of [1, 7, 42, 500, 9999]) {
      expect(parseSequence(formatTransactionNumber(2026, sequence))).toBe(sequence);
    }
  });

  it('reads an unparseable number as 0 rather than throwing', () => {
    // A CSV import or a hand-edited row must not break the next create. It
    // reads as 0, the next matter gets a fresh sequence, and a genuine
    // duplicate is refused by the unique index rather than guessed at here.
    expect(parseSequence('LEGACY/7')).toBe(0);
    expect(parseSequence('')).toBe(0);
    expect(parseSequence('RE-2026-')).toBe(0);
    expect(parseSequence('RE-2026-ABCD')).toBe(0);
  });

  it('scopes the prefix per year, so a new year restarts at 0001', () => {
    expect(transactionNumberPrefix(2026)).toBe('RE-2026-');
    expect(transactionNumberPrefix(2027)).toBe('RE-2027-');
    expect(formatTransactionNumber(2027, 1)).toBe('RE-2027-0001');
  });
});
