import { describe, it, expect } from 'vitest';
import { normalizeAdLink, cleanAdLinks, adLinksOf, AD_LINKS_MAX } from '../lib/vnext/ntAdLinks';
describe('ntAdLinks', () => {
  it('normalize', () => {
    expect(normalizeAdLink('fb.com/ads/1')).toBe('https://fb.com/ads/1');
    expect(normalizeAdLink('https://www.facebook.com/x?y=1')).toBe('https://www.facebook.com/x?y=1');
    expect(normalizeAdLink('javascript:alert(1)')).toBe('');
    expect(normalizeAdLink('ftp://a.com')).toBe('');
    expect(normalizeAdLink('abc')).toBe('');
    expect(normalizeAdLink('  ')).toBe('');
  });
  it('clean: dedupe, skip blanks, errors', () => {
    expect(cleanAdLinks(['a.com', '', 'https://a.com/']).links).toEqual(['https://a.com/']);
    expect(cleanAdLinks(['a.com', 'bad']).error).toMatch(/thứ 2/);
    expect(cleanAdLinks(Array.from({ length: AD_LINKS_MAX + 1 }, (_, i) => `a.com/${i}`)).error).toMatch(/Tối đa/);
  });
  it('adLinksOf', () => {
    expect(adLinksOf({})).toEqual([]);
    expect(adLinksOf({ adLinks: ['x', 1, ''] })).toEqual(['x']);
  });
});
