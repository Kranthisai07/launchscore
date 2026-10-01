import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { shouldWait, waitForEnter } from "../src/wait.js";

describe("shouldWait", () => {
  const person = { stdinTTY: true, stdoutTTY: true, env: {} };

  it("waits when a person is at a terminal", () => {
    expect(shouldWait(person)).toBe(true);
  });

  it("does not wait with --no-wait", () => {
    expect(shouldWait({ ...person, noWait: true })).toBe(false);
  });

  it.each([
    ["input is piped", { ...person, stdinTTY: false }],
    ["output is piped or redirected", { ...person, stdoutTTY: false }],
    ["neither is a terminal (a script or a service)", { stdinTTY: false, stdoutTTY: false, env: {} }],
    ["CI is set", { ...person, env: { CI: "true" } }],
  ])("does not wait when %s, so scripts and CI never hang", (_name, context) => {
    expect(shouldWait(context)).toBe(false);
  });
});

describe("waitForEnter", () => {
  const written = (out: PassThrough): string => (out.read() ?? Buffer.alloc(0)).toString();

  it("shows the message and resumes only once Enter is pressed", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let finished = false;
    const waiting = waitForEnter(input, output).then(() => (finished = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(finished).toBe(false); // still waiting: the window would stay open
    expect(written(output)).toContain("Press Enter to close this window...");
    input.write("\n");
    await waiting;
    expect(finished).toBe(true);
  });

  it("also finishes if there is nobody to press Enter (input closed)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const waiting = waitForEnter(input, output);
    input.end();
    await expect(waiting).resolves.toBeUndefined();
  });

  it("uses the message it is given", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const waiting = waitForEnter(input, output, "Hit return");
    input.write("x\n");
    await waiting;
    expect(written(output)).toContain("Hit return");
  });
});
