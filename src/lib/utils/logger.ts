type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogMeta {
  [key: string]: unknown
}

const isDev = process.env.NODE_ENV === 'development'

function formatMessage(level: LogLevel, message: string, meta?: LogMeta): string {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`
}

export const logger = {
  debug: (message: string, meta?: LogMeta): void => {
    if (isDev) {
      console.debug(formatMessage('debug', message, meta))
    }
  },

  info: (message: string, meta?: LogMeta): void => {
    console.info(formatMessage('info', message, meta))
  },

  warn: (message: string, meta?: LogMeta): void => {
    console.warn(formatMessage('warn', message, meta))
  },

  error: (message: string, meta?: LogMeta): void => {
    console.error(formatMessage('error', message, meta))
  },
}
