import { readExperienceEngineSettings, setInlineNoticesEnabled } from "../../config/settings-store.js";

export const runConfigCommand = (action?: string, key?: string, value?: string): void => {
  if (action === "get" && key === "notices.inline") {
    const settings = readExperienceEngineSettings();
    console.log(String(settings.notices?.inline ?? true));
    return;
  }

  if (action === "set" && key === "notices.inline") {
    if (value !== "true" && value !== "false") {
      console.log("Usage: ee config set notices.inline true|false");
      return;
    }

    setInlineNoticesEnabled(value === "true");
    console.log(
      value === "true"
        ? "[ExperienceEngine] Inline notices enabled."
        : "[ExperienceEngine] Inline notices disabled."
    );
    return;
  }

  console.log("Usage: ee config <get|set> notices.inline [true|false]");
};
