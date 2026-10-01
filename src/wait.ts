// A window that was opened just to run launchscore closes the moment the program ends, taking the score
// and any error message with it. When a person is sitting at a terminal, wait for Enter before exiting.

export interface WaitContext {
  noWait?: boolean; // the --no-wait flag
  stdinTTY?: boolean;
  stdoutTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}

export function shouldWait(context: WaitContext): boolean {
  if (context.noWait) return false;
  if (!context.stdinTTY || !context.stdoutTTY) return false; // piped or scripted: never block
  if (context.env?.CI) return false;
  return true;
}

export const currentWaitContext = (noWait: boolean): WaitContext => ({
  noWait,
  stdinTTY: Boolean(process.stdin.isTTY),
  stdoutTTY: Boolean(process.stdout.isTTY),
  env: process.env,
});

interface Input {
  once(event: "data" | "end" | "close", listener: () => void): unknown;
  removeListener(event: "data" | "end" | "close", listener: () => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export async function waitForEnter(
  input: Input = process.stdin,
  output: { write(text: string): unknown } = process.stdout,
  message = "\nPress Enter to close this window...",
): Promise<void> {
  output.write(`${message} `);
  await new Promise<void>((resolve) => {
    const done = (): void => {
      input.removeListener("data", done);
      input.removeListener("end", done);
      input.removeListener("close", done);
      resolve();
    };
    input.once("data", done); // a line was typed, so Enter was pressed
    input.once("end", done); // nobody is there to press it
    input.once("close", done);
    input.resume();
  });
  input.pause();
  output.write("\n");
}

// Waits only when it makes sense (a person at a terminal, no --no-wait, not CI).
export async function pauseBeforeExit(noWait: boolean): Promise<void> {
  if (shouldWait(currentWaitContext(noWait))) await waitForEnter();
}
