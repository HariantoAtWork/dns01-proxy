type RouterLogLevel = 'error' | 'warn' | 'info' | 'debug'

const rank: Record<RouterLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

function threshold(): RouterLogLevel {
  const raw = (process.env.ROUTER_LOG_LEVEL || process.env.PROXY_LOG_LEVEL || 'info').toLowerCase()
  if (raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug' || raw === 'silent') {
    return raw === 'silent' ? 'error' : raw
  }
  return 'info'
}

export function routerLog(level: RouterLogLevel, message: string): void {
  const min = threshold()
  if (rank[level] > rank[min]) {
    return
  }
  const line = `[router] ${message}`
  if (level === 'error') {
    console.error(line)
  }
  else if (level === 'warn') {
    console.warn(line)
  }
  else {
    console.info(line)
  }
}
