import { bucketAging, summarizeAging } from '../reports';

describe('aging buckets', () => {
  it('classifies by invoice age', () => {
    expect(bucketAging('2026-07-20', 100, '2026-07-29')).toBe('0-30');
    expect(bucketAging('2026-06-01', 100, '2026-07-29')).toBe('31-60');
    expect(bucketAging('2026-05-01', 100, '2026-07-29')).toBe('61-90');
    expect(bucketAging('2026-01-01', 100, '2026-07-29')).toBe('90+');
  });

  it('summarizes open dues', () => {
    const buckets = summarizeAging(
      [
        { date: '2026-07-20', due: 100 },
        { date: '2026-01-01', due: 250 },
      ],
      '2026-07-29'
    );
    expect(buckets.find((b) => b.key === '0-30')?.total).toBe(100);
    expect(buckets.find((b) => b.key === '90+')?.total).toBe(250);
    expect(buckets.find((b) => b.key === '31-60')?.count).toBe(0);
  });
});
