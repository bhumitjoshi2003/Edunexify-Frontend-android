import { countLabel, countOnPage, serverTotal } from './page-count.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('dashboard counts from pages', () => {
  const rows = (pending: number, other: number) => [
    ...Array.from({ length: pending }, () => ({ status: 'PENDING' })),
    ...Array.from({ length: other }, () => ({ status: 'APPROVED' })),
  ];
  const isPending = (r: { status: string }) => r.status === 'PENDING';

  it('a server-filtered total is complete even when more than one page exists', () => {
    const value = serverTotal({ content: rows(10, 0), totalElements: 37, last: false });
    expect(value).toEqual({ count: 37, complete: true });
    expect(countLabel(value)).toBe('37');
  });

  it('counting on the only page is complete', () => {
    const value = countOnPage({ content: rows(3, 4), totalElements: 7, last: true }, isPending);
    expect(value).toEqual({ count: 3, complete: true });
    expect(countLabel(value)).toBe('3');
  });

  it('counting on the first of several pages is labelled "at least"', () => {
    const value = countOnPage({ content: rows(6, 4), totalElements: 25, last: false }, isPending);
    expect(value).toEqual({ count: 6, complete: false });
    expect(countLabel(value)).toBe('6+');
  });

  it('more than 10 / 50 mixed rows never produce a false exact total', () => {
    expect(countOnPage({ content: rows(4, 6), totalElements: 11 }, isPending).complete).toBeFalse();
    expect(countOnPage({ content: rows(20, 30), totalElements: 51 }, isPending).complete).toBeFalse();
  });
});
