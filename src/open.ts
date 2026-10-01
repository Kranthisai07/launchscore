import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export function openCommand(file: string, platform: NodeJS.Platform = process.platform): { command: string; args: string[] } {
  // Windows goes through rundll32 rather than `cmd /c start`: cmd would read characters such as & in a path as commands.
  if (platform === "win32") return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", file] };
  if (platform === "darwin") return { command: "open", args: [file] };
  return { command: "xdg-open", args: [file] };
}

// Opens a file in the default program (the browser, for an .html file). Never throws: a failure is reported
// through onError so the scan result is not lost because a browser could not be started.
export function openFile(
  file: string,
  onError: (error: Error) => void,
  spawnImpl: Spawn = spawn,
  platform: NodeJS.Platform = process.platform,
): void {
  const { command, args } = openCommand(file, platform);
  try {
    const child = spawnImpl(command, args, { detached: true, stdio: "ignore" });
    child.on("error", onError);
    child.unref();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
