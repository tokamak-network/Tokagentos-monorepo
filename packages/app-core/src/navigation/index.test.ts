import { describe, expect, it } from "vitest";

import { getTabGroups, tabFromPath } from "./index";

describe("navigation", () => {
  it("routes node catalog URLs into automations", () => {
    expect(tabFromPath("/node-catalog")).toBe("automations");
    expect(tabFromPath("/automations/node-catalog")).toBe("automations");
  });

  it("does not expose a standalone node catalog tab group", () => {
    expect(getTabGroups().some((group) => group.label === "Nodes")).toBe(false);
  });

  it("defaults the root path to the operator console", () => {
    expect(tabFromPath("/")).toBe("operator");
  });

  it("exposes only the operator and settings tab groups", () => {
    const labels = getTabGroups().map((g) => g.label);
    expect(labels).toEqual(["Operator", "Settings"]);
  });
});
