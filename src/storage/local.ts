import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StorageStat, StreamRange } from './provider.js';

/**
 * Stores objects on the local filesystem (a Railway Volume in production).
 * Keys are sharded two levels deep to avoid huge flat directories.
 */
export class LocalStorageProvider implements StorageProvider {
	public constructor(private readonly root: string) {}

	public keyFor(id: string): string {
		const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
		return path.posix.join(safeId.slice(0, 2), safeId.slice(2, 4), safeId);
	}

	/**
	 * Resolve a storage key to an absolute path, rejecting any attempt to
	 * escape the storage root (path traversal, absolute paths, null bytes).
	 */
	private resolve(key: string): string {
		if (key.includes('\0')) throw new Error('Invalid storage key');
		const target = path.resolve(this.root, key);
		const rootWithSep = path.resolve(this.root) + path.sep;
		if (target !== path.resolve(this.root) && !target.startsWith(rootWithSep)) {
			throw new Error('Storage key escapes root');
		}

		return target;
	}

	public async put(key: string, data: Buffer | string): Promise<void> {
		const target = this.resolve(key);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, data);
	}

	public async putFromFile(key: string, sourcePath: string): Promise<void> {
		const target = this.resolve(key);
		await mkdir(path.dirname(target), { recursive: true });
		try {
			// Prefer copy+unlink over rename: temp dir and uploads may live on
			// different mounts (rename across devices fails with EXDEV).
			await copyFile(sourcePath, target);
		} finally {
			await rm(sourcePath, { force: true });
		}
	}

	public async get(key: string): Promise<Buffer> {
		return readFile(this.resolve(key));
	}

	public stream(key: string, range?: StreamRange): NodeJS.ReadableStream {
		const target = this.resolve(key);
		if (range && (range.start !== undefined || range.end !== undefined)) {
			return createReadStream(target, { start: range.start ?? 0, end: range.end });
		}

		return createReadStream(target);
	}

	public async stat(key: string): Promise<StorageStat | null> {
		try {
			const info = await stat(this.resolve(key));
			return { size: info.size, mtimeMs: info.mtimeMs };
		} catch {
			return null;
		}
	}

	public async exists(key: string): Promise<boolean> {
		return (await this.stat(key)) !== null;
	}

	public async delete(key: string): Promise<void> {
		try {
			await unlink(this.resolve(key));
		} catch {
			// already gone — treat as success
		}
	}
}
