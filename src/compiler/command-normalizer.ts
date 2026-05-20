import type { ToolEvent, NormalizedToolEvent } from "../types/domain.js";

export class CommandNormalizer {
  /**
   * Redacts volatile components like UUIDs, absolute/relative paths, ports, and branch names.
   */
  public static redactVolatileTokens(input: string): string {
    if (!input) return "";

    let redacted = input;

    // 1. Redact UUIDs
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    redacted = redacted.replace(uuidRegex, "[UUID]");

    // 2. Redact absolute Windows and Unix paths
    // Windows paths like C:\Users\...\file.ext or d:/project/...
    const winPathRegex = /[a-zA-Z]:\\[^\s"']+/g;
    redacted = redacted.replace(winPathRegex, "[PATH]");
    const winForwardPathRegex = /[a-zA-Z]:\/(?!\/)[^\s"']+/g;
    redacted = redacted.replace(winForwardPathRegex, "[PATH]");

    // Unix paths like /home/user/... or /tmp/...
    // Avoid redacting commands starting with slash or generic patterns, so we only match longer path-like strings
    const unixPathRegex = /(?:^|[\s"'\(=])(\/(?:home|Users|tmp|usr|opt|var|etc|bin|projects?|workspace|app)[a-zA-Z0-9_\-\.\/]+)/gi;
    redacted = redacted.replace(unixPathRegex, (match, p1) => {
      return match.replace(p1, "[PATH]");
    });

    // 3. Redact port numbers (e.g. :3000 or :8080)
    const portRegex = /:([0-9]{4,5})\b/g;
    redacted = redacted.replace(portRegex, ":[PORT]");

    // 4. Redact branch names in git checkout command, or any feature/issue branch patterns
    // E.g., feature/issue-102 or bugfix/abc
    const branchRegex = /\b(feature|bugfix|release|hotfix|origin)\/[a-zA-Z0-9_\-\.]+/gi;
    redacted = redacted.replace(branchRegex, "[BRANCH]");

    // Also redact the specific git branch argument in checkout/switch commands
    const gitCheckoutRegex = /(git\s+(?:checkout|switch)\s+(-b\s+)?)([a-zA-Z0-9_\-\.\/]+)/gi;
    redacted = redacted.replace(gitCheckoutRegex, (match, p1, p2, p3) => {
      // If p3 is not an option (starts with -), redact it
      if (p3 && !p3.startsWith("-")) {
        return `${p1}[BRANCH]`;
      }
      return match;
    });

    return redacted;
  }

  /**
   * Helper to extract the basename from a file path.
   */
  public static getBasename(pathStr: string): string {
    const normalized = pathStr.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || "";
  }

  /**
   * Helper to extract the file extension.
   */
  public static getExtension(pathStr: string): string {
    const basename = this.getBasename(pathStr);
    const dotIndex = basename.lastIndexOf(".");
    if (dotIndex === -1 || dotIndex === 0) return "";
    return basename.slice(dotIndex + 1);
  }

  /**
   * Normalizes a raw shell command string to extract commandFamily, subcommand, and redacted inputs.
   */
  public static normalizeCommand(rawCommand: string): {
    commandFamily?: string;
    subcommand?: string;
    normalizedInput: string;
  } {
    const redacted = this.redactVolatileTokens(rawCommand.trim());
    if (!redacted) {
      return { normalizedInput: "" };
    }

    // Split into tokens
    const tokens = redacted.split(/\s+/);
    let rawExecutable = tokens[0] || "";

    // Normalize executable path (e.g. .\node_modules\.bin\tsc -> tsc)
    let executable = this.getBasename(rawExecutable).replace(/\.(exe|cmd|bat|sh)$/i, "").toLowerCase();

    // Group common executables/aliases
    if (["pnpm", "npm", "yarn", "bun", "npx"].includes(executable)) {
      // Package managers
      let subcommand = "";
      // Find first non-option token after package manager
      let subIdx = 1;
      while (subIdx < tokens.length && tokens[subIdx]?.startsWith("-")) {
        subIdx++;
      }
      const primarySub = tokens[subIdx] || "";
      if (primarySub && !primarySub.startsWith("-")) {
        subcommand = primarySub.toLowerCase();
        if (subcommand === "run" || subcommand === "exec") {
          // If "run" or "exec", try to capture the next script name (e.g. pnpm run build -> run_build, pnpm exec tsc -> exec_tsc)
          let scriptIdx = subIdx + 1;
          while (scriptIdx < tokens.length && tokens[scriptIdx]?.startsWith("-")) {
            scriptIdx++;
          }
          const scriptName = tokens[scriptIdx] || "";
          if (scriptName && !scriptName.startsWith("-")) {
            subcommand = `${subcommand}_${scriptName.toLowerCase()}`;
          }
        }
      }
      return {
        commandFamily: executable,
        subcommand,
        normalizedInput: redacted
      };
    }

    if (executable === "git") {
      let subcommand = "";
      let subIdx = 1;
      while (subIdx < tokens.length && tokens[subIdx]?.startsWith("-")) {
        subIdx++;
      }
      const primarySub = tokens[subIdx] || "";
      if (primarySub && !primarySub.startsWith("-")) {
        subcommand = primarySub.toLowerCase();
      }
      return {
        commandFamily: "git",
        subcommand,
        normalizedInput: redacted
      };
    }

    // Other known build/test tools
    if (["tsc", "vitest", "jest", "mocha", "eslint", "prettier", "vite", "next"].includes(executable)) {
      return {
        commandFamily: executable,
        subcommand: "run",
        normalizedInput: redacted
      };
    }

    // Fallback for general executables
    return {
      commandFamily: executable || undefined,
      normalizedInput: redacted
    };
  }

  /**
   * Transforms a raw ToolEvent into a NormalizedToolEvent.
   */
  public static normalizeToolEvent(event: ToolEvent): NormalizedToolEvent {
    const status = event.status;

    // Handle command executions
    const isCmdToolName = /^(run_command|bash|execute_command|terminal|sh)$/i.test(event.tool_name);
    if (isCmdToolName && event.input_summary) {
      const normalizedCmd = this.normalizeCommand(event.input_summary);
      return {
        toolName: event.tool_name,
        commandFamily: normalizedCmd.commandFamily,
        subcommand: normalizedCmd.subcommand,
        normalizedInput: normalizedCmd.normalizedInput,
        status
      };
    }

    // Handle host-native file tools
    const fileTools = [
      "write_to_file",
      "replace_file_content",
      "multi_replace_file_content",
      "write_file",
      "read_file",
      "view_file"
    ];

    if (fileTools.includes(event.tool_name) && event.input_summary) {
      // input_summary usually contains the file path
      const pathStr = event.input_summary.trim();
      const basename = this.getBasename(pathStr);
      const extension = this.getExtension(pathStr);

      return {
        toolName: event.tool_name,
        artifactName: basename || undefined,
        artifactExtension: extension || undefined,
        normalizedInput: this.redactVolatileTokens(pathStr),
        status
      };
    }

    // Default normalization
    return {
      toolName: event.tool_name,
      normalizedInput: event.input_summary ? this.redactVolatileTokens(event.input_summary) : undefined,
      status
    };
  }
}
