import { describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import { openCommand, openFile } from "../src/open.js";
import { VERSION } from "../src/version.js";
import { readFileSync } from "node:fs";

const FILE = "C:\Users\Me & You\scans\launchscore-report.html";

function fakeSpawn() {
  const handlers: Record<string, (e: Error) => void> = {};
  const child = { on: vi.fn((event: string, cb: (e: Error) => void) => ((handlers[event] = cb), child)), unref: vi.fn() };
  const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
  return { spawnImpl, child, handlers };
}

describe("openCommand", () => {
  it("uses rundll32 on Windows, so no shell reads characters such as & in the path", () => {
    expect(openCommand(FILE, "win32")).toEqual({ command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", FILE] });
  });

  it("uses open on macOS", () => {
    expect(openCommand("/tmp/r.html", "darwin")).toEqual({ command: "open", args: ["/tmp/r.html"] });
  });

  it.each(["linux", "freebsd"] as const)("uses xdg-open on %s", (platform) => {
    expect(openCommand("/tmp/r.html", platform)).toEqual({ command: "xdg-open", args: ["/tmp/r.html"] });
  });

  it("never goes through a shell", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      expect(openCommand(FILE, platform).command).not.toMatch(/cmd|sh$|powershell/i);
    }
  });
});

describe("openFile", () => {
  it("starts the program detached, with output ignored, and lets the scan exit without waiting for it", () => {
    const { spawnImpl, child } = fakeSpawn();
    openFile(FILE, () => undefined, spawnImpl, "win32");
    expect(spawnImpl).toHaveBeenCalledWith("rundll32.exe", ["url.dll,FileProtocolHandler", FILE], { detached: true, stdio: "ignore" });
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it("reports a program that cannot be started instead of crashing", () => {
    const { spawnImpl, handlers } = fakeSpawn();
    const onError = vi.fn();
    openFile(FILE, onError, spawnImpl, "linux");
    handlers.error(new Error("spawn xdg-open ENOENT"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "spawn xdg-open ENOENT" }));
  });

  it("reports a spawn that throws straight away", () => {
    const onError = vi.fn();
    openFile(FILE, onError, () => {
      throw new Error("boom");
    }, "darwin");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
  });
});

describe("VERSION", () => {
  it("is the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
