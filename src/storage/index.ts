import { config } from '../config.js';
import { LocalStorageProvider } from './local.js';
import type { StorageProvider } from './provider.js';

let provider: StorageProvider | null = null;

/** Returns the active storage provider (local disk by default). */
export const getStorage = (): StorageProvider => {
	if (!provider) {
		provider = new LocalStorageProvider(config.paths.uploads);
	}

	return provider;
};

export type { StorageProvider } from './provider.js';
