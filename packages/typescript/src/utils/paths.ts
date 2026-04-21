/**
 * tokagentOS data directory paths configuration
 * This module provides a standard interface for accessing data directory paths
 * that can be customized via environment variables.
 */

/**
 * Join path segments, using native path.join in Node.js or simple string join in browser
 */
function pathJoin(...parts: string[]): string {
	if (typeof process !== "undefined" && process.platform) {
		const path = require("node:path");
		return path.join(...parts);
	}
	// Browser fallback: simple forward-slash join
	return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

/**
 * Get the current working directory, with browser fallback
 */
function getCwd(): string {
	if (typeof process !== "undefined" && process.cwd) {
		return process.cwd();
	}
	return ".";
}

/**
 * Get an environment variable value
 */
function getEnvVar(key: string): string | undefined {
	if (typeof process !== "undefined" && process.env) {
		return process.env[key];
	}
	return undefined;
}

/**
 * Interface for tokagentOS paths configuration
 */
export interface TokagentPathsConfig {
	dataDir: string;
	databaseDir: string;
	charactersDir: string;
	generatedDir: string;
	uploadsAgentsDir: string;
	uploadsChannelsDir: string;
}

/**
 * Path configuration with environment variable key and default subdirectory
 */
interface PathConfig {
	envKey: string;
	subPath: string[];
}

/**
 * Path configurations for all tokagentOS directories
 */
const PATH_CONFIGS: Record<
	keyof Omit<TokagentPathsConfig, "dataDir">,
	PathConfig
> = {
	databaseDir: {
		envKey: "TOKAGENT_DATABASE_DIR",
		subPath: [".tokagentdb"],
	},
	charactersDir: {
		envKey: "TOKAGENT_DATA_DIR_CHARACTERS",
		subPath: ["data", "characters"],
	},
	generatedDir: {
		envKey: "TOKAGENT_DATA_DIR_GENERATED",
		subPath: ["data", "generated"],
	},
	uploadsAgentsDir: {
		envKey: "TOKAGENT_DATA_DIR_UPLOADS_AGENTS",
		subPath: ["data", "uploads", "agents"],
	},
	uploadsChannelsDir: {
		envKey: "TOKAGENT_DATA_DIR_UPLOADS_CHANNELS",
		subPath: ["data", "uploads", "channels"],
	},
};

/**
 * tokagentOS paths management class
 * Provides centralized access to all tokagentOS data directory paths
 */
class TokagentPaths {
	private cache = new Map<string, string>();

	/**
	 * Get the base data directory
	 */
	getDataDir(): string {
		const cached = this.cache.get("dataDir");
		if (cached) return cached;

		const dir = getEnvVar("TOKAGENT_DATA_DIR") || pathJoin(getCwd(), ".tokagent");
		this.cache.set("dataDir", dir);
		return dir;
	}

	/**
	 * Get the database directory (backward compatible with PGLITE_DATA_DIR)
	 */
	getDatabaseDir(): string {
		return this.getPath("databaseDir", "PGLITE_DATA_DIR");
	}

	/**
	 * Get the characters storage directory
	 */
	getCharactersDir(): string {
		return this.getPath("charactersDir");
	}

	/**
	 * Get the AI-generated content directory
	 */
	getGeneratedDir(): string {
		return this.getPath("generatedDir");
	}

	/**
	 * Get the agent uploads directory
	 */
	getUploadsAgentsDir(): string {
		return this.getPath("uploadsAgentsDir");
	}

	/**
	 * Get the channel uploads directory
	 */
	getUploadsChannelsDir(): string {
		return this.getPath("uploadsChannelsDir");
	}

	/**
	 * Get all paths as a configuration object
	 */
	getAllPaths(): TokagentPathsConfig {
		return {
			dataDir: this.getDataDir(),
			databaseDir: this.getDatabaseDir(),
			charactersDir: this.getCharactersDir(),
			generatedDir: this.getGeneratedDir(),
			uploadsAgentsDir: this.getUploadsAgentsDir(),
			uploadsChannelsDir: this.getUploadsChannelsDir(),
		};
	}

	/**
	 * Clear the cache (useful for testing)
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get a path by config key, using cache
	 */
	private getPath(
		key: keyof typeof PATH_CONFIGS,
		fallbackEnvKey?: string,
	): string {
		const cached = this.cache.get(key);
		if (cached) return cached;

		const config = PATH_CONFIGS[key];
		const envValue =
			getEnvVar(config.envKey) ||
			(fallbackEnvKey ? getEnvVar(fallbackEnvKey) : undefined);
		const dir = envValue || pathJoin(this.getDataDir(), ...config.subPath);

		this.cache.set(key, dir);
		return dir;
	}
}

/**
 * Singleton instance of the TokagentPaths class
 */
let pathsInstance: TokagentPaths | null = null;

/**
 * Get the singleton TokagentPaths instance
 */
export function getTokagentPaths(): TokagentPaths {
	if (!pathsInstance) {
		pathsInstance = new TokagentPaths();
	}
	return pathsInstance;
}

/**
 * Convenience function to get the data directory
 */
export function getDataDir(): string {
	return getTokagentPaths().getDataDir();
}

/**
 * Convenience function to get the database directory
 */
export function getDatabaseDir(): string {
	return getTokagentPaths().getDatabaseDir();
}

/**
 * Convenience function to get the characters directory
 */
export function getCharactersDir(): string {
	return getTokagentPaths().getCharactersDir();
}

/**
 * Convenience function to get the generated content directory
 */
export function getGeneratedDir(): string {
	return getTokagentPaths().getGeneratedDir();
}

/**
 * Convenience function to get the agent uploads directory
 */
export function getUploadsAgentsDir(): string {
	return getTokagentPaths().getUploadsAgentsDir();
}

/**
 * Convenience function to get the channel uploads directory
 */
export function getUploadsChannelsDir(): string {
	return getTokagentPaths().getUploadsChannelsDir();
}

/**
 * Convenience function to get all paths
 */
export function getAllTokagentPaths(): TokagentPathsConfig {
	return getTokagentPaths().getAllPaths();
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetPaths(): void {
	if (pathsInstance) {
		pathsInstance.clearCache();
	}
	pathsInstance = null;
}
