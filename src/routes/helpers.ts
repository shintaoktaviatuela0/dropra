import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getSettings } from '../services/settings.js';
import { getSessionUser } from '../services/sessions.js';
import type { User } from '../services/users.js';
import type { FileRecord } from '../services/files.js';

export const SESSION_COOKIE = 'dopra_session';

const baseCookieOptions = {
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: config.isProduction,
	path: '/',
	signed: true
};

const firstHeaderValue = (value: string | string[] | undefined): string | undefined => {
	if (!value) return undefined;
	const raw = Array.isArray(value) ? value[0] : value;
	return raw?.split(',')[0]?.trim() || undefined;
};

/** Plain host[:port] or [ipv6][:port]; rejects header-injection attempts. */
const VALID_HOST = /^(?:[A-Za-z0-9._-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/**
 * Resolve the public base URL for building shareable links.
 *
 * Priority: configured PUBLIC_URL/site setting > proxy forwarded headers >
 * the request Host header. Reverse proxies (Railway, Render, Heroku, nginx,
 * Codespaces...) rewrite Host to localhost and put the real domain in
 * X-Forwarded-Host, so that header must win when the proxy is trusted.
 */
export const getBaseUrl = (req: FastifyRequest): string => {
	const configured = getSettings().publicBaseUrl || config.publicUrl;
	if (configured) return configured.replace(/\/+$/, '');

	const forwardedHost = config.trustProxy ? firstHeaderValue(req.headers['x-forwarded-host']) : undefined;
	const candidate = forwardedHost ?? req.headers.host ?? `localhost:${config.port}`;
	const host = VALID_HOST.test(candidate) ? candidate : `localhost:${config.port}`;

	const forwardedProto = config.trustProxy ? firstHeaderValue(req.headers['x-forwarded-proto']) : undefined;
	const proto = forwardedProto === 'https' || forwardedProto === 'http' ? forwardedProto : req.protocol;

	return `${proto}://${host}`;
};

export const clientIp = (req: FastifyRequest): string => req.ip;

/** Return the authenticated admin user for this request, or null. */
export const getAdminUser = (req: FastifyRequest): User | null => {
	const raw = req.cookies[SESSION_COOKIE];
	if (!raw) return null;
	const unsigned = req.unsignCookie(raw);
	if (!unsigned.valid || !unsigned.value) return null;
	const user = getSessionUser(unsigned.value);
	if (!user || user.role !== 'admin') return null;
	return user;
};

export const setSessionCookie = (reply: FastifyReply, sessionId: string): void => {
	reply.setCookie(SESSION_COOKIE, sessionId, { ...baseCookieOptions, maxAge: 7 * 24 * 60 * 60 });
};

export const clearSessionCookie = (reply: FastifyReply): void => {
	reply.clearCookie(SESSION_COOKIE, { ...baseCookieOptions });
};

/** Per-file unlock cookie (set after a correct file password). */
const unlockCookieName = (file: FileRecord): string => `u_${file.shortCode}`;

export const setUnlockCookie = (reply: FastifyReply, file: FileRecord): void => {
	reply.setCookie(unlockCookieName(file), file.uuid, { ...baseCookieOptions, maxAge: 6 * 60 * 60 });
};

export const hasUnlock = (req: FastifyRequest, file: FileRecord): boolean => {
	const raw = req.cookies[unlockCookieName(file)];
	if (!raw) return false;
	const unsigned = req.unsignCookie(raw);
	return unsigned.valid && unsigned.value === file.uuid;
};
