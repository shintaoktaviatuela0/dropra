import type { FastifyReply } from 'fastify';

/** Consistent success envelope: { success: true, data }. */
export const apiOk = <T>(reply: FastifyReply, data: T, status = 200): FastifyReply =>
	reply.code(status).send({ success: true, data });

/** Consistent error envelope: { success: false, error: { code, message } }. */
export const apiError = (reply: FastifyReply, status: number, code: string, message: string): FastifyReply =>
	reply.code(status).send({ success: false, error: { code, message } });
