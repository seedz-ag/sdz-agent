import { ChildProcess, spawn } from "child_process";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";

export type ListenShellCommandExecuteInput = {
  args: string[];
  sessionId?: string;
};

type ShellSession = {
  process: ChildProcess;
  lastUsed: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;

@singleton()
export class ListenShellCommand
  implements ICommand<ListenShellCommandExecuteInput, string | void>
{
  private readonly sessions: Map<string, ShellSession> = new Map();
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(private readonly loggerAdapter: LoggerAdapter) {
    this.startCleanupInterval();
  }

  public async execute({
    args,
    sessionId,
  }: ListenShellCommandExecuteInput): Promise<string | void> {
    try {
      const command = args[args.length - 1];
      if (!command) throw new Error("Command is required.");

      if (command === "__SDZ_SESSION_DESTROY__") {
        if (sessionId) this.destroySession(sessionId);
        return "";
      }

      if (!sessionId) {
        return await this.runEphemeral(command);
      }

      return await this.runInSession(sessionId, command);
    } catch (error: any) {
      await this.rescue(error);
    }
  }

  private runEphemeral(command: string): Promise<string> {
    return new Promise((resolve) => {
      const proc = spawn("bash", ["-c", `{ ${command}; } 2>&1`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      proc.stdout!.on("data", (chunk: Buffer) => (output += chunk.toString()));
      proc.on("close", () => resolve(output));
    });
  }

  private runInSession(sessionId: string, command: string): Promise<string> {
    const session = this.getOrCreateSession(sessionId);
    session.lastUsed = Date.now();

    return new Promise((resolve) => {
      const sentinel = `__SDZ_END_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}__`;
      let output = "";

      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        const idx = output.indexOf(sentinel);
        if (idx !== -1) {
          session.process.stdout!.off("data", onData);
          resolve(output.slice(0, idx));
        }
      };

      session.process.stdout!.on("data", onData);
      session.process.stdin!.write(
        `{ ${command}; } 2>&1; printf '%s' '${sentinel}'\n`
      );
    });
  }

  private getOrCreateSession(sessionId: string): ShellSession {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const proc = spawn("bash", ["-l"], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, TERM: "xterm-256color", PS1: "" },
    });

    proc.on("exit", () => {
      this.sessions.delete(sessionId);
      this.loggerAdapter.log("info", `Shell session ${sessionId} exited`);
    });

    const session: ShellSession = { process: proc, lastUsed: Date.now() };
    this.sessions.set(sessionId, session);
    this.loggerAdapter.log("info", `Shell session ${sessionId} created`);

    return session;
  }

  private destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill("SIGTERM");
      this.sessions.delete(sessionId);
      this.loggerAdapter.log("info", `Shell session ${sessionId} destroyed`);
    }
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      this.sessions.forEach((session, id) => {
        if (now - session.lastUsed > SESSION_TTL_MS) {
          this.loggerAdapter.log("info", `Shell session ${id} expired`);
          session.process.kill("SIGTERM");
          this.sessions.delete(id);
        }
      });
    }, 60_000);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public async rescue(error: Error) {
    this.loggerAdapter.log("error", error.message, error.stack);
    throw error;
  }
}
