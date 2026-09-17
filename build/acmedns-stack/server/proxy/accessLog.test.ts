import { afterEach, describe, expect, test } from 'bun:test'
import {
  formatProxyAccessLine,
  isNoisyUnmatchedHost,
  proxyAccessLogEnabled,
} from './accessLog'
import {
  parseProxyLogLevel,
  proxyLogEnabled,
  resolveProxyLogLevel,
} from './proxyLog'

afterEach(() => {
  delete process.env.PROXY_ACCESS_LOG
  delete process.env.PROXY_ACCESS_LOG_LEVEL
  delete process.env.PROXY_LOG_LEVEL
  delete process.env.LOG_LEVEL
})

describe('parseProxyLogLevel', () => {
  test('parses aliases', () => {
    expect(parseProxyLogLevel('WARN')).toBe('warn')
    expect(parseProxyLogLevel('off')).toBe('silent')
    expect(parseProxyLogLevel('trace')).toBe('debug')
    expect(parseProxyLogLevel('nope')).toBeNull()
  })
})

describe('resolveProxyLogLevel', () => {
  test('prefers PROXY_LOG_LEVEL over LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'debug'
    expect(resolveProxyLogLevel()).toBe('debug')
    process.env.PROXY_LOG_LEVEL = 'warn'
    expect(resolveProxyLogLevel()).toBe('warn')
  })
})

describe('proxyLogEnabled', () => {
  test('info threshold includes warn but not debug', () => {
    process.env.PROXY_LOG_LEVEL = 'info'
    expect(proxyLogEnabled('warn')).toBe(true)
    expect(proxyLogEnabled('info')).toBe(true)
    expect(proxyLogEnabled('debug')).toBe(false)
  })
})

describe('proxyAccessLogEnabled', () => {
  test('defaults on at info; off when threshold is warn', () => {
    expect(proxyAccessLogEnabled()).toBe(true)
    process.env.PROXY_LOG_LEVEL = 'warn'
    expect(proxyAccessLogEnabled()).toBe(false)
  })

  test('PROXY_ACCESS_LOG=0 disables; ACCESS_LOG_LEVEL=debug needs debug threshold', () => {
    process.env.PROXY_ACCESS_LOG = '0'
    expect(proxyAccessLogEnabled()).toBe(false)
    delete process.env.PROXY_ACCESS_LOG
    process.env.PROXY_ACCESS_LOG_LEVEL = 'debug'
    process.env.PROXY_LOG_LEVEL = 'info'
    expect(proxyAccessLogEnabled()).toBe(false)
    process.env.PROXY_LOG_LEVEL = 'debug'
    expect(proxyAccessLogEnabled()).toBe(true)
  })
})

describe('isNoisyUnmatchedHost', () => {
  test('flags docker DNS, loopback, and bare IPs', () => {
    expect(isNoisyUnmatchedHost('host.docker.internal')).toBe(true)
    expect(isNoisyUnmatchedHost('host.docker.internal:80')).toBe(true)
    expect(isNoisyUnmatchedHost('127.0.0.1')).toBe(true)
    expect(isNoisyUnmatchedHost('localhost:443')).toBe(true)
    expect(isNoisyUnmatchedHost('[::1]:80')).toBe(true)
    expect(isNoisyUnmatchedHost('10.0.0.5')).toBe(true)
    expect(isNoisyUnmatchedHost('blog.example.com')).toBe(false)
  })
})

describe('formatProxyAccessLine', () => {
  test('formats status timing inbound path and upstream', () => {
    expect(formatProxyAccessLine({
      status: 200,
      method: 'GET',
      inbound: 'app.example.com',
      path: '/',
      upstream: 'http://10.0.0.5:8080/',
      ms: 12.4,
      id: 'abc',
    })).toBe(
      '[proxy] 200 12ms GET app.example.com/ → http://10.0.0.5:8080/ id=abc',
    )
  })
})
