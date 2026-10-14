import { describe, expect, it } from 'vitest'
import {
  authEnabled,
  createSessionToken,
  isLoopback,
  originAllowed,
  RateLimiter,
  safeEqual,
  verifySessionToken,
} from './auth'

describe('auth utils', () => {
  it('enables auth only with a password', () => {
    expect(authEnabled({})).toBe(false)
    expect(authEnabled({ DBLOCAL_PASSWORD: 'x' })).toBe(true)
  })
  it('compares passwords', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
  it('signs and verifies sessions, rejecting tampering and expiry', () => {
    const t = createSessionToken(1000)
    expect(verifySessionToken(t, 2000)).toBe(true)
    expect(verifySessionToken(t + 'x', 2000)).toBe(false)
    expect(verifySessionToken(t, 1000 + 8 * 24 * 3600 * 1000)).toBe(false)
    expect(verifySessionToken(undefined)).toBe(false)
  })
  it('checks origin', () => {
    expect(originAllowed('http://localhost:5555', 'localhost:5555')).toBe(true)
    expect(originAllowed('http://evil.com', 'localhost:5555')).toBe(false)
    expect(originAllowed(undefined, 'localhost:5555')).toBe(true)
  })
  it('rate limits', () => {
    const r = new RateLimiter(2, 1000)
    expect([r.take('a', 0), r.take('a', 1), r.take('a', 2)]).toEqual([true, true, false])
    expect(r.take('a', 1001)).toBe(true)
  })
  it('detects loopback', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('0.0.0.0')).toBe(false)
  })
})
