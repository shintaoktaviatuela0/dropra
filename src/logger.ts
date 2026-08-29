import { pino } from 'pino';
import { config } from './config.js';

/**
 * Structured logger. Sensitive fields are redacted so secrets never reach the
 * log stream (admin password, cookies, tokens, auth headers, file passwords).
 */
export const logger = pino({
	level: process.env.LOG_LEVEL ?? (config.isProduction ? 'info' : 'debug'),
	redact: {
		paths: [
			'password',
			'*.password',
			'ADMIN_PASSWORD',
			'req.headers.authorization',
			'req.headers.cookie',
			'headers.authorization',
			'headers.cookie',
			'*.deletionToken',
			'deletionToken',
			'sessionId',
			'*.sessionId'
		],
		censor: '[redacted]'
	},
	transport: config.isProduction
		? undefined
		: {
				target: 'pino-pretty',
				options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
			}
});
