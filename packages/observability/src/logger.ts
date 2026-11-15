import pino, {type Logger} from 'pino';

/**
 * JSON logs, one line per event, with `service` on every line so a log
 * backend (Loki, CloudWatch, Datadog) can filter by service. For readable
 * local output, pipe through `pino-pretty`.
 */
export function createLogger(service: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: {service},
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {level: (label) => ({level: label})},
    // Never log secrets, even by accident.
    redact: {
      paths: [
        '*.secret',
        '*.password',
        '*.authorization',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[redacted]',
    },
  });
}

export type {Logger};
