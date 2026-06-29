import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, "..", "..");

describe("templates-manifest.json", () => {
  test("manifest file exists", () => {
    expect(
      fs.existsSync(path.join(PACKAGE_ROOT, "templates-manifest.json")),
    ).toBe(true);
  });

  test("manifest contains only the fullstack-app template", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(PACKAGE_ROOT, "templates-manifest.json"),
        "utf-8",
      ),
    );

    expect(Array.isArray(manifest.templates)).toBe(true);
    expect(
      manifest.templates.map((template: { id: string }) => template.id),
    ).toEqual(["fullstack-app"]);
  });

  test("packaged templates directory contains fullstack-app and not plugin", () => {
    expect(
      fs.existsSync(path.join(PACKAGE_ROOT, "templates", "fullstack-app")),
    ).toBe(true);
    expect(fs.existsSync(path.join(PACKAGE_ROOT, "templates", "plugin"))).toBe(
      false,
    );
  });
});
