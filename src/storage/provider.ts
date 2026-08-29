export interface StorageStat {
	size: number;
	mtimeMs: number;
}

export interface StreamRange {
	start?: number;
	end?: number;
}

/**
 * Pluggable storage backend. The default implementation writes to the local
 * Railway volume; future drivers (e.g. S3) can implement the same contract
 * without touching the rest of the application.
 */
export interface StorageProvider {
	/** Build a sharded, collision-resistant storage key for a new object. */
	keyFor(id: string): string;
	/** Persist an in-memory buffer/string under `key`. */
	put(key: string, data: Buffer | string): Promise<void>;
	/** Move an already-written temp file into its final location. */
	putFromFile(key: string, sourcePath: string): Promise<void>;
	/** Read an entire object into memory (small objects only). */
	get(key: string): Promise<Buffer>;
	/** Stream an object, optionally a byte range (for HTTP Range support). */
	stream(key: string, range?: StreamRange): NodeJS.ReadableStream;
	/** Return size/mtime, or null if the object does not exist. */
	stat(key: string): Promise<StorageStat | null>;
	exists(key: string): Promise<boolean>;
	delete(key: string): Promise<void>;
}
