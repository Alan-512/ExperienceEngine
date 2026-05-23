import {
  createSharedBehaviorLoop,
  type SharedLookupArgs,
  type SharedToolResultArgs,
  type SharedFinalizeArgs,
  type SharedHostEventArgs,
  type SharedServerOptions
} from "../shared-mcp/behavior-loop.js";

export type CodexLookupArgs = SharedLookupArgs;
export type CodexToolResultArgs = SharedToolResultArgs;
export type CodexFinalizeArgs = SharedFinalizeArgs;
export type CodexHostEventArgs = SharedHostEventArgs;
export type CodexServerOptions = SharedServerOptions;

export const createCodexBehaviorLoop = (options: CodexServerOptions = {}) => {
  return createSharedBehaviorLoop("codex", options);
};
