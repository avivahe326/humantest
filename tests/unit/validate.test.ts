import { describe, it, expect } from 'vitest';
import { isPrivateUrl, isSafeTargetUrl } from '@/lib/validate';

describe('isPrivateUrl @P0 @Unit', () => {
  it('blocks localhost', () => {
    expect(isPrivateUrl('http://localhost:3000')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('blocks private IPv4 ranges', () => {
    expect(isPrivateUrl('http://10.0.0.1')).toBe(true);
    expect(isPrivateUrl('http://172.16.0.1')).toBe(true);
    expect(isPrivateUrl('http://192.168.1.1')).toBe(true);
    expect(isPrivateUrl('http://169.254.169.254')).toBe(true);
  });

  it('blocks IPv6 private', () => {
    expect(isPrivateUrl('http://[::1]')).toBe(true);
  });

  it('blocks IPv6 private fc/fd ranges', () => {
    expect(isPrivateUrl('http://[fc00::1]')).toBe(true);
    expect(isPrivateUrl('http://[fd12::1]')).toBe(true);
  });

  it('allows public URLs', () => {
    expect(isPrivateUrl('https://example.com')).toBe(false);
    expect(isPrivateUrl('https://google.com')).toBe(false);
  });

  it('blocks invalid URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
  });
});

describe('isSafeTargetUrl @P0 @Unit', () => {
  it('allows http and https', () => {
    expect(isSafeTargetUrl('http://example.com')).toBe(true);
    expect(isSafeTargetUrl('https://example.com')).toBe(true);
  });

  it('rejects javascript protocol', () => {
    expect(isSafeTargetUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data protocol', () => {
    expect(isSafeTargetUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isSafeTargetUrl('not-a-url')).toBe(false);
  });
});
