/**
 * Idle shutdown for console sessions.
 *
 * A regular agent runs `listen` forever, and that is what an installed agent
 * needs: the channel must be reachable at any time. A SAAS console session is
 * the opposite — it comes up so someone can investigate, and a forgotten
 * session is an idle task holding a customer's CLIENT_ID/CLIENT_SECRET.
 *
 * WHY `Ping` IS NOT ACTIVITY
 *
 * The API emits `{"command":"Ping"}` every 30 seconds
 * (`command-stream.handler.ts`), and the agent dispatcher treats it as a no-op.
 * A timer reset on every stream message would therefore NEVER fire: the ping
 * alone would keep the session alive forever, which is the exact problem this
 * file exists to prevent.
 *
 * So activity means an EFFECTIVE command — `Query`, `Execute`, `Shell`. The
 * API heartbeat postpones nothing.
 *
 * No I/O on purpose: the clock and the shutdown callback are injected, so the
 * behaviour can be verified without starting an agent.
 */

export type IdleTimerOptions = {
  /** Minutes without an effective command before shutting down. */
  minutes: number;
  /** Called once the session has been idle for too long. */
  onExpire: (idleFor: number) => void;
  /** Injectable for tests. */
  now?: () => number;
};

/** Messages the API emits on its own. None of them postpone the shutdown. */
const HEARTBEAT = new Set(["Ping", "ListActiveClients", "Response"]);

export class IdleTimer {
  private timer?: NodeJS.Timeout;
  private lastActivity: number;
  private stopped = false;

  private readonly ms: number;
  private readonly now: () => number;
  private readonly onExpire: (idleFor: number) => void;

  constructor({ minutes, onExpire, now = Date.now }: IdleTimerOptions) {
    this.ms = Math.max(1, Number(minutes)) * 60_000;
    this.now = now;
    this.onExpire = onExpire;
    this.lastActivity = this.now();
  }

  /**
   * Whether a stream message counts as activity.
   *
   * `Response` is excluded along with the heartbeat: it is what the agent
   * itself sends back, so it is no evidence that someone is still on the other
   * end.
   */
  public static isActivity(command: unknown): boolean {
    return typeof command === "string" && command.length > 0 && !HEARTBEAT.has(command);
  }

  public start(): this {
    this.schedule();
    return this;
  }

  /** Called on every message; only an effective command resets the clock. */
  public touch(command: unknown): boolean {
    if (this.stopped || !IdleTimer.isActivity(command)) return false;
    this.lastActivity = this.now();
    this.schedule();
    return true;
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  public get idleFor(): number {
    return this.now() - this.lastActivity;
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      this.onExpire(this.idleFor);
    }, this.ms);
    // Does not hold the process: if nothing else is running, the agent exits.
    this.timer.unref?.();
  }
}
