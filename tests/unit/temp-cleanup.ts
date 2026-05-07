import { existsSync, rmSync } from "node:fs";

export const removeTempDirForTests = (dir: string): void => {
  if (!existsSync(dir)) {
    return;
  }

  try {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: process.platform === "win32" ? 5 : 0,
      retryDelay: process.platform === "win32" ? 100 : 0
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const isWindowsCleanupLock =
      process.platform === "win32" &&
      (code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY");
    if (!isWindowsCleanupLock) {
      throw error;
    }
  }
};
