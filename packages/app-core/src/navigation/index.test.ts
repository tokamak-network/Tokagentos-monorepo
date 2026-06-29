import { describe, expect, it } from "vitest";

import { getTabGroups, tabFromPath } from "./index";

describe("navigation", () => {
  it("defaults the root path to the operator console", () => {
    expect(tabFromPath("/")).toBe("operator");
  });

  it("exposes only the operator and settings tab groups", () => {
    const labels = getTabGroups().map((g) => g.label);
    expect(labels).toEqual(["Operator", "Settings"]);
  });

  it("redirects retired paths to the operator console", () => {
    expect(tabFromPath("/chat")).toBe("operator");
    expect(tabFromPath("/billing")).toBe("operator");
    expect(tabFromPath("/automations")).toBe("operator");
  });

  it("keeps settings addressable", () => {
    expect(tabFromPath("/settings")).toBe("settings");
  });
});
