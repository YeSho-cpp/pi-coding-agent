import * as vscode from "vscode";
import { resolvePiExecutable, type PiInvocation } from "@frostime/pi-rpc";

import { configuredPiInvocation } from "../configuration/configuredPiInvocation.js";
import { readConfiguration } from "../configuration/readConfiguration.js";
import type { DiagnosticLogger } from "../diagnostics/DiagnosticLogger.js";
import {
  buildPiUpdateArguments,
  buildPiUpdateCommandLine,
  checkForPiUpdate,
  isUpdateCheckDue,
  isVersionCheckSuppressed,
  probePiVersion,
  shouldAdvertisePiUpdate,
  type LatestPiRelease,
  type PiUpdateCheck,
  type PiVersionProbe,
  type UpdateCheckStamp,
} from "./piUpdates.js";

const IGNORED_VERSIONS_KEY = "piAgent.updates.ignoredVersions";
const LAST_CHECK_KEY = "piAgent.updates.lastCheckAt";
const AVAILABLE_KEY = "piAgent.updates.availableVersion";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5_000;

const ACTION_UPDATE = "Update";
const ACTION_LATER = "Later";
const ACTION_SKIP = "Skip This Version";
const ACTION_RESTART = "Restart Sessions";

export interface PiUpdateNotifierOptions {
  probeVersion?: PiVersionProbe;
  checkForUpdate?: typeof checkForPiUpdate;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

/**
 * Surfaces a newer Pi CLI release and updates it on request.
 *
 * Pi only checks for its own updates from its interactive TUI, so a Pi driven over RPC —
 * which is how this extension runs it — never learns about a new release. Detection is done
 * here and the update itself is delegated to `pi update`, which already knows the install
 * method, how to quarantine native dependencies on Windows, and how managed installations
 * differ from npm/pnpm ones.
 *
 * Two surfaces, deliberately: a one-off notification that respects a daily interval, and a
 * status bar entry that stays until the update is taken or the version is skipped. A
 * notification alone is easy to dismiss by accident, after which the release is undiscoverable.
 */
export class PiUpdateNotifier implements vscode.Disposable {
  readonly #context: vscode.ExtensionContext;
  readonly #logger: DiagnosticLogger;
  readonly #probeVersion: PiVersionProbe;
  readonly #checkForUpdate: typeof checkForPiUpdate;
  readonly #env: NodeJS.ProcessEnv;
  readonly #now: () => number;
  readonly #statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  readonly #extensionVersion: string;
  #startTimer: ReturnType<typeof setTimeout> | undefined;
  #checking = false;

  constructor(
    context: vscode.ExtensionContext,
    logger: DiagnosticLogger,
    options: PiUpdateNotifierOptions = {},
  ) {
    this.#context = context;
    this.#logger = logger;
    this.#probeVersion = options.probeVersion ?? probePiVersion;
    this.#checkForUpdate = options.checkForUpdate ?? checkForPiUpdate;
    this.#env = options.env ?? process.env;
    this.#now = options.now ?? Date.now;
    this.#extensionVersion = readExtensionVersion(context);
  }

  dispose(): void {
    if (this.#startTimer !== undefined) clearTimeout(this.#startTimer);
    this.#startTimer = undefined;
    this.#statusItem.dispose();
  }

  /** Delay so the check never competes with session startup. */
  startScheduledCheck(delayMs = STARTUP_DELAY_MS): void {
    if (this.#startTimer !== undefined) return;
    this.#startTimer = setTimeout(() => {
      this.#startTimer = undefined;
      void this.checkForUpdates({ respectInterval: true });
    }, delayMs);
    this.#startTimer.unref?.();
  }

  /** Manual entry point (command); ignores the once-per-day interval. */
  async checkForUpdates(options: { respectInterval: boolean } = { respectInterval: false }): Promise<void> {
    if (isVersionCheckSuppressed(this.#env)) {
      this.#logger.debug("Pi update check skipped: PI_OFFLINE or PI_SKIP_VERSION_CHECK is set");
      return;
    }
    if (!this.#isEnabled()) return;
    // One check at a time; a second prompt for the same release would be noise.
    if (this.#checking) return;
    this.#checking = true;
    try {
      const invocation = this.#resolveInvocation();
      const current = await this.#probeVersion(invocation);
      if (!current) {
        this.#logger.info("Pi update check skipped: could not determine the installed Pi version");
        return;
      }
      // Reflect whatever the last completed check learned before deciding whether to go online
      // again, so restarting the window does not drop the reminder.
      this.#refreshStatusItem(current);
      if (options.respectInterval && !this.#dueForCheck()) {
        this.#logger.info(`Pi update check skipped: already checked within the last 24h (by v${this.#extensionVersion})`);
        return;
      }

      const result = await this.#checkForUpdate(current);
      await this.#applyResult(invocation, current, result);
    } catch (error) {
      this.#logger.error("Pi update check failed", error);
    } finally {
      this.#checking = false;
    }
  }

  /** Reinstalls Pi regardless of the detected version, for a repair after a broken install. */
  async updateNow(): Promise<void> {
    if (isVersionCheckSuppressed(this.#env)) {
      this.#logger.debug("Pi update skipped: PI_OFFLINE or PI_SKIP_VERSION_CHECK is set");
      return;
    }
    if (this.#checking) return;
    this.#checking = true;
    try {
      await this.#runUpdate(this.#resolveInvocation(), true);
    } catch (error) {
      this.#logger.error("Pi update failed", error);
    } finally {
      this.#checking = false;
    }
  }

  #isEnabled(): boolean {
    return vscode.workspace.getConfiguration("piAgent").get<boolean>("updates.check", true);
  }

  #dueForCheck(): boolean {
    const stamp = this.#context.globalState.get<UpdateCheckStamp | number>(LAST_CHECK_KEY);
    return isUpdateCheckDue(stamp, {
      now: this.#now(),
      extensionVersion: this.#extensionVersion,
      intervalMs: CHECK_INTERVAL_MS,
    });
  }

  #ignoredVersions(): readonly string[] {
    return this.#context.globalState.get<string[]>(IGNORED_VERSIONS_KEY, []);
  }

  #resolveInvocation(): PiInvocation {
    return resolvePiExecutable(configuredPiInvocation(readConfiguration().piExecutable));
  }

  async #applyResult(invocation: PiInvocation, current: string, result: PiUpdateCheck): Promise<void> {
    // Only a completed check may stamp the interval; otherwise one offline attempt would
    // silence the check for a day.
    if (result.status === "unknown") {
      this.#logger.info("Pi update check inconclusive (offline or blocked); will retry on the next activation");
      return;
    }
    await this.#context.globalState.update(LAST_CHECK_KEY, {
      at: this.#now(),
      by: this.#extensionVersion,
    } satisfies UpdateCheckStamp);

    if (result.status === "current") {
      this.#logger.info(`Pi is up to date (${current})`);
      await this.#context.globalState.update(AVAILABLE_KEY, undefined);
      this.#refreshStatusItem(current);
      return;
    }

    this.#logger.info(`Pi ${result.release.version} is available (current ${current})`);

    await this.#context.globalState.update(AVAILABLE_KEY, result.release.version);
    this.#refreshStatusItem(current);
    if (this.#ignoredVersions().includes(result.release.version)) return;
    await this.#announce(invocation, current, result.release);
  }

  #refreshStatusItem(current: string): void {
    const available = this.#context.globalState.get<string>(AVAILABLE_KEY, "");
    if (!shouldAdvertisePiUpdate(available, current, this.#ignoredVersions())) {
      this.#statusItem.hide();
      return;
    }
    this.#statusItem.text = `$(cloud-download) Pi ${available}`;
    this.#statusItem.tooltip = `Pi ${available} is available (you have ${current}). Click to review.`;
    this.#statusItem.command = "piAgent.checkPiUpdate";
    this.#statusItem.show();
  }

  #forgetAvailable(): Promise<void> {
    this.#statusItem.hide();
    return Promise.resolve(this.#context.globalState.update(AVAILABLE_KEY, undefined));
  }

  async #announce(invocation: PiInvocation, current: string, release: LatestPiRelease): Promise<void> {
    const note = release.note ? ` ${release.note}` : "";
    const choice = await vscode.window.showInformationMessage(
      `Pi ${release.version} is available (you have ${current}).${note}`,
      ACTION_UPDATE,
      ACTION_LATER,
      ACTION_SKIP,
    );
    if (choice === ACTION_SKIP) {
      await this.#context.globalState.update(IGNORED_VERSIONS_KEY, [
        ...new Set([...this.#ignoredVersions(), release.version]),
      ]);
      await this.#forgetAvailable();
      return;
    }
    if (choice === ACTION_UPDATE) await this.#runUpdate(invocation);
  }

  async #runUpdate(invocation: PiInvocation, force = false): Promise<void> {
    const exitCode = await this.#executeTask(invocation, force);
    if (exitCode === undefined) {
      void vscode.window.showErrorMessage(
        `Could not start the Pi update. Run \`${buildPiUpdateCommandLine(invocation)}\` in a terminal.`,
      );
      return;
    }
    if (exitCode !== 0) {
      void vscode.window.showErrorMessage(
        `Pi update failed (exit code ${exitCode}). Run \`${buildPiUpdateCommandLine(invocation)}\` in a terminal to see the full output.`,
      );
      return;
    }
    await this.#forgetAvailable();
    const choice = await vscode.window.showInformationMessage(
      "Pi updated. Restart sessions to load the new version.",
      ACTION_RESTART,
    );
    if (choice === ACTION_RESTART) await vscode.commands.executeCommand("piAgent.restartAllSessions");
  }

  /**
   * Runs in a task rather than invisibly: the package manager's own output is the progress
   * indicator, and the environment is inherited so an npm/pnpm proxy configuration still
   * applies.
   */
  async #executeTask(invocation: PiInvocation, force = false): Promise<number | undefined> {
    const execution = new vscode.ShellExecution(invocation.command, buildPiUpdateArguments(invocation, force));
    const task = new vscode.Task(
      { type: "pi-update" },
      vscode.TaskScope.Global,
      "pi update",
      "pi",
      execution,
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared,
      clear: false,
      echo: true,
    };

    let resolveEnded: (code: number | undefined) => void = () => {};
    const ended = new Promise<number | undefined>((resolvePromise) => {
      resolveEnded = resolvePromise;
    });
    // Correlate by task identity: ShellExecution is not a TaskExecution in the API types,
    // while TaskProcessEndEvent reports the TaskExecution that wraps our task.
    const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task !== task) return;
      disposable.dispose();
      resolveEnded(event.exitCode);
    });

    try {
      await vscode.tasks.executeTask(task);
    } catch (error) {
      disposable.dispose();
      this.#logger.error("Failed to start the Pi update task", error);
      return undefined;
    }
    return await ended;
  }
}

function readExtensionVersion(context: vscode.ExtensionContext): string {
  const manifest = context.extension.packageJSON as { version?: unknown } | undefined;
  return typeof manifest?.version === "string" && manifest.version ? manifest.version : "unknown";
}
