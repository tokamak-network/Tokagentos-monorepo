import { describe, expect, it } from "vitest";

import { getTabGroups, tabFromPath } from "./index";

describe("navigation", () => {
  it("defaults the root path to the operator console", () => {
    expect(tabFromPath("/")).toBe("operator");
  });

  it("exposes only the operator tab group", () => {
    const labels = getTabGroups().map((g) => g.label);
    expect(labels).toEqual(["Operator"]);
  });

  it("redirects retired paths to the operator console", () => {
    expect(tabFromPath("/chat")).toBe("operator");
    expect(tabFromPath("/billing")).toBe("operator");
    expect(tabFromPath("/automations")).toBe("operator");
  });

  it("redirects the retired /settings path to the operator console", () => {
    expect(tabFromPath("/settings")).toBe("operator");
  });
});
