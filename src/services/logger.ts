// CQ-04: Logger estructurado para backend
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }  // stdout legible en dev
    : undefined,  // JSON puro en producción (Railway lo parsea)
});
