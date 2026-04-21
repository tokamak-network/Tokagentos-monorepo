// Module augmentation for @tokagentos/core Action type to add Tokagent-specific fields.
import type { Action } from "@tokagentos/core";

declare module "@tokagentos/core" {
  interface Action {
    /** When true, suppresses the post-action continuation prompt. */
    suppressPostActionContinuation?: boolean;
  }
}

export type { Action };
