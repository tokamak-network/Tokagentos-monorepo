/**
 * Error Handling System - Claude Code Style
 *
 * Comprehensive error handling with categories, severity levels,
 * and resolution suggestions.
 */

import type { JsonValue } from "../types.js";

// ============================================================================
// Error Severity Levels
// ============================================================================

export enum ErrorLevel {
  /** Critical errors that prevent the application from functioning */
  CRITICAL = 0,
  /** Major errors that significantly impact functionality */
  MAJOR = 1,
  /** Minor errors that don't significantly impact functionality */
  MINOR = 2,
  /** Informational errors that don't impact functionality */
  INFORMATIONAL = 3,
  /** Debug level */
  DEBUG = 4,
  /** Info level */
  INFO = 5,
  /** Warning level */
  WARNING = 6,
  /** Error level */
  ERROR = 7,
  /** Fatal level */
  FATAL = 8,
}

// ============================================================================
// Error Categories
// ============================================================================

export enum ErrorCategory {
  /** Application-level errors */
  APPLICATION = 0,
  /** Authentication-related errors */
  AUTHENTICATION = 1,
  /** Network-related errors */
  NETWORK = 2,
  /** File system-related errors */
  FILE_SYSTEM = 3,
  /** Command execution-related errors */
  COMMAND_EXECUTION = 4,
  /** AI service-related errors */
  AI_SERVICE = 5,
  /** Configuration-related errors */
  CONFIGURATION = 6,
  /** Resource-related errors */
  RESOURCE = 7,
  /** Unknown errors */
  UNKNOWN = 8,
  /** Internal errors */
  INTERNAL = 9,
  /** Validation errors */
  VALIDATION = 10,
  /** Initialization errors */
  INITIALIZATION = 11,
  /** Server errors */
  SERVER = 12,
  /** API errors */
  API = 13,
  /** Timeout errors */
  TIMEOUT = 14,
  /** Rate limit errors */
  RATE_LIMIT = 15,
  /** Connection errors */
  CONNECTION = 16,
  /** Authorization errors */
  AUTHORIZATION = 17,
  /** File not found errors */
  FILE_NOT_FOUND = 18,
  /** File access errors */
  FILE_ACCESS = 19,
  /** File read errors */
  FILE_READ = 20,
  /** File write errors */
  FILE_WRITE = 21,
  /** Command errors */
  COMMAND = 22,
  /** Command not found errors */
  COMMAND_NOT_FOUND = 23,
  /** Task execution errors */
  TASK_EXECUTION = 24,
  /** Parse errors */
  PARSE = 25,
  /** Git errors */
  GIT = 26,
}

// ============================================================================
// Error Options Interface
// ============================================================================

export interface TokagentCodeErrorOptions {
  /** Original error that caused this error */
  cause?: Error | JsonValue;
  /** Error category */
  category?: ErrorCategory;
  /** Error level */
  level?: ErrorLevel;
  /** Hint on how to resolve the error */
  resolution?: string | string[];
  /** Additional details about the error */
  details?: Record<string, JsonValue>;
  /** Error code */
  code?: string;
}

// ============================================================================
// Main Error Class
// ============================================================================

/**
 * Custom error class with categorization and resolution suggestions
 */
export class TokagentCodeError extends Error {
  /** Original error that caused this error */
  cause?: Error | JsonValue;
  /** Error category */
  category: ErrorCategory;
  /** Error level */
  level: ErrorLevel;
  /** Hint on how to resolve the error */
  resolution?: string | string[];
  /** Additional details about the error */
  details: Record<string, JsonValue>;
  /** Error code */
  code?: string;
  /** Timestamp when error occurred */
  timestamp: Date;

  constructor(message: string, options: TokagentCodeErrorOptions = {}) {
    super(message);

    this.name = "TokagentCodeError";
    this.cause = options.cause;
    this.category = options.category ?? ErrorCategory.UNKNOWN;
    this.level = options.level ?? ErrorLevel.ERROR;
    this.resolution = options.resolution;
    this.details = options.details ?? {};
    this.code = options.code;
    this.timestamp = new Date();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TokagentCodeError);
    }
  }

  /**
   * Get a formatted error message with resolution suggestions
   */
  getFormattedMessage(): string {
    let message = `[${ErrorCategory[this.category]}] ${this.message}`;

    if (this.resolution) {
      const resolutions = Array.isArray(this.resolution)
        ? this.resolution
        : [this.resolution];
      message += "\n\nSuggested resolution(s):";
      resolutions.forEach((r, i) => {
        message += `\n  ${i + 1}. ${r}`;
      });
    }

    return message;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, JsonValue> {
    return {
      name: this.name,
      message: this.message,
      category: ErrorCategory[this.category],
      level: ErrorLevel[this.level],
      resolution: this.resolution ?? null,
      details: this.details ?? null,
      code: this.code ?? null,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack ?? null,
    };
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a file system error
 */
export function createFileError(
  message: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(message, {
    category: ErrorCategory.FILE_SYSTEM,
    level: ErrorLevel.ERROR,
    ...options,
  });
}

/**
 * Create a file not found error
 */
export function createFileNotFoundError(
  filePath: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(`File not found: ${filePath}`, {
    category: ErrorCategory.FILE_NOT_FOUND,
    level: ErrorLevel.ERROR,
    resolution: [
      `Check if the file path is correct: ${filePath}`,
      "Use LIST_FILES to explore the directory structure",
      "The file may have been moved or deleted",
    ],
    details: { filePath },
    ...options,
  });
}

/**
 * Create a file access error
 */
export function createFileAccessError(
  filePath: string,
  operation: "read" | "write",
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(`Permission denied ${operation}ing: ${filePath}`, {
    category: ErrorCategory.FILE_ACCESS,
    level: ErrorLevel.ERROR,
    resolution: [
      `Check file permissions for: ${filePath}`,
      "You may need elevated permissions to access this file",
      "Verify the file is not locked by another process",
    ],
    details: { filePath, operation },
    ...options,
  });
}

/**
 * Create a command execution error
 */
export function createCommandError(
  command: string,
  exitCode: number | string | undefined,
  stderr: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(`Command failed: ${command}`, {
    category: ErrorCategory.COMMAND_EXECUTION,
    level: ErrorLevel.ERROR,
    resolution: [
      "Check the command syntax and arguments",
      "Verify required dependencies are installed",
      "Check the stderr output for more details",
    ],
    details: { command, exitCode: exitCode ?? null, stderr },
    ...options,
  });
}

/**
 * Create an AI service error
 */
export function createAIServiceError(
  message: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(message, {
    category: ErrorCategory.AI_SERVICE,
    level: ErrorLevel.ERROR,
    resolution: [
      "Check your API key is valid",
      "Verify network connectivity",
      "The AI service may be temporarily unavailable",
    ],
    ...options,
  });
}

/**
 * Create a rate limit error
 */
export function createRateLimitError(
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError("Rate limit exceeded", {
    category: ErrorCategory.RATE_LIMIT,
    level: ErrorLevel.WARNING,
    resolution: [
      "Wait a moment before making more requests",
      "Consider reducing request frequency",
      "Check your API quota",
    ],
    ...options,
  });
}

/**
 * Create a timeout error
 */
export function createTimeoutError(
  operation: string,
  timeoutMs: number,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(
    `Operation timed out after ${timeoutMs}ms: ${operation}`,
    {
      category: ErrorCategory.TIMEOUT,
      level: ErrorLevel.ERROR,
      resolution: [
        "The operation took too long to complete",
        "Try breaking the operation into smaller steps",
        "Check for infinite loops or blocking operations",
      ],
      details: { operation, timeoutMs },
      ...options,
    },
  );
}

/**
 * Create a validation error
 */
export function createValidationError(
  message: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(message, {
    category: ErrorCategory.VALIDATION,
    level: ErrorLevel.WARNING,
    ...options,
  });
}

/**
 * Create a task execution error
 */
export function createTaskError(
  taskId: string,
  message: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(message, {
    category: ErrorCategory.TASK_EXECUTION,
    level: ErrorLevel.ERROR,
    resolution: [
      "Check the task output for more details",
      "Try breaking the task into smaller steps",
      "Verify all required files exist",
    ],
    details: { taskId },
    ...options,
  });
}

/**
 * Create a git error
 */
export function createGitError(
  operation: string,
  stderr: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  return new TokagentCodeError(`Git ${operation} failed`, {
    category: ErrorCategory.GIT,
    level: ErrorLevel.ERROR,
    resolution: [
      "Check that you are in a git repository",
      "Verify git is installed and in PATH",
      "Check the stderr output for more details",
    ],
    details: { operation, stderr },
    ...options,
  });
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Whether to use exponential backoff */
  backoff: boolean;
  /** Categories of errors to retry */
  retryableCategories: ErrorCategory[];
  /** Callback for retry attempts */
  onRetry?: (attempt: number, error: TokagentCodeError) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoff: true,
  retryableCategories: [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.AI_SERVICE,
    ErrorCategory.CONNECTION,
  ],
};

/**
 * Wrap a function with retry logic and exponential backoff
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };

  return (async () => {
    let lastError: TokagentCodeError | Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        if (error instanceof TokagentCodeError) {
          lastError = error;
        } else if (error instanceof Error) {
          lastError = new TokagentCodeError(error.message, { cause: error });
        } else {
          lastError = new TokagentCodeError(String(error), {
            cause: String(error),
          });
        }

        // Check if we should retry
        const shouldRetry =
          attempt < opts.maxRetries &&
          (lastError instanceof TokagentCodeError
            ? opts.retryableCategories.includes(lastError.category)
            : true);

        if (!shouldRetry) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = opts.backoff
          ? Math.min(opts.initialDelayMs * 2 ** attempt, opts.maxDelayMs)
          : opts.initialDelayMs;

        // Add jitter (±10%)
        const jitter = delay * 0.1 * (Math.random() * 2 - 1);
        const finalDelay = Math.round(delay + jitter);

        if (opts.onRetry) {
          opts.onRetry(attempt + 1, lastError as TokagentCodeError);
        }

        await new Promise((r) => setTimeout(r, finalDelay));
      }
    }

    throw lastError || new TokagentCodeError("Retry failed");
  })();
}

// ============================================================================
// Error Formatting Utilities
// ============================================================================

/**
 * Format an error for display to the user
 */
export function formatErrorForDisplay(
  error: Error | TokagentCodeError | JsonValue | undefined,
): string {
  if (error instanceof TokagentCodeError) {
    return error.getFormattedMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Extract error details from various error types
 */
export function extractErrorDetails(
  error: Error | TokagentCodeError | JsonValue | undefined,
): {
  message: string;
  category: ErrorCategory;
  code?: string;
} {
  if (error instanceof TokagentCodeError) {
    return {
      message: error.message,
      category: error.category,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;

    // Map common Node.js error codes to categories
    const category = (() => {
      switch (nodeError.code) {
        case "ENOENT":
          return ErrorCategory.FILE_NOT_FOUND;
        case "EACCES":
          return ErrorCategory.FILE_ACCESS;
        case "EPERM":
          return ErrorCategory.FILE_ACCESS;
        case "ENOTDIR":
          return ErrorCategory.FILE_SYSTEM;
        case "EISDIR":
          return ErrorCategory.FILE_SYSTEM;
        case "ECONNREFUSED":
          return ErrorCategory.CONNECTION;
        case "ETIMEDOUT":
          return ErrorCategory.TIMEOUT;
        case "ENOTFOUND":
          return ErrorCategory.NETWORK;
        default:
          return ErrorCategory.UNKNOWN;
      }
    })();

    return {
      message: error.message,
      category,
      code: nodeError.code,
    };
  }

  return {
    message: String(error),
    category: ErrorCategory.UNKNOWN,
  };
}

/**
 * Check if an error is of a specific category
 */
export function isErrorCategory(
  error: Error | TokagentCodeError | JsonValue | undefined,
  category: ErrorCategory,
): boolean {
  if (error instanceof TokagentCodeError) {
    return error.category === category;
  }
  return false;
}

/**
 * Wrap an error with additional context
 */
export function wrapError(
  error: Error | TokagentCodeError | JsonValue | undefined,
  message: string,
  options: Partial<TokagentCodeErrorOptions> = {},
): TokagentCodeError {
  const details = extractErrorDetails(error);

  return new TokagentCodeError(`${message}: ${details.message}`, {
    cause: error,
    category: options.category ?? details.category,
    code: options.code ?? details.code,
    ...options,
  });
}
