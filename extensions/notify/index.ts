// Adapted from @jmcombs/pi-notify 1.1.0 by Jeremy Combs under the MIT License.
// This fork adds OSC injection defenses and suppresses output in non-TTY sessions.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ESC = "\x1b";
const BEL = "\x07";
const ST = "\x1b\\";
const TITLE = "Pi";
const MAX_NOTIFICATION_LENGTH = 240;
const UNSUPPORTED_MESSAGE =
  "Notifications via OSC are not supported in this terminal. See the project README for supported terminals.";

interface RunStats {
  turns: number;
  toolCalls: number;
  errors: number;
  toolNames: Set<string>;
}

export function sanitizeNotificationText(value: string): string {
  const sanitized = value
    .replace(/\s/gu, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/;/gu, ",")
    .replace(/ +/gu, " ")
    .trim()
    .slice(0, MAX_NOTIFICATION_LENGTH);
  return sanitized || "Notification";
}

export function canSendTerminalNotification(isTTY = Boolean(process.stdout.isTTY)): boolean {
  return isTTY;
}

function wrapForTmux(sequence: string): string {
  if (!process.env.TMUX) return sequence;
  const escaped = sequence.split(ESC).join(`${ESC}${ESC}`);
  return `${ESC}Ptmux;${escaped}${ST}`;
}

function notifyOSC777(title: string, body: string): void {
  process.stdout.write(wrapForTmux(`${ESC}]777;notify;${title};${body}${BEL}`));
}

function notifyOSC9(message: string): void {
  process.stdout.write(wrapForTmux(`${ESC}]9;${message}${BEL}`));
}

function notifyOSC99(title: string, body: string): void {
  process.stdout.write(wrapForTmux(`${ESC}]99;i=1:d=0;${title}${ST}`));
  process.stdout.write(wrapForTmux(`${ESC}]99;i=1:p=body;${body}${ST}`));
}

function isUnsupportedTerminal(): boolean {
  if (process.platform === "win32" && !process.env.WT_SESSION) return true;
  if (process.env.TERM_PROGRAM === "Apple_Terminal") return true;
  return (process.env.TERM ?? "").toLowerCase().includes("alacritty");
}

function getSender(): ((title: string, body: string) => void) | null {
  if (isUnsupportedTerminal()) return null;
  if (process.env.KITTY_WINDOW_ID) return notifyOSC99;

  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === "ghostty" || termProgram === "iTerm.app" || process.env.ITERM_SESSION_ID) {
    return (title, body) => notifyOSC9(`${title}: ${body}`);
  }

  return notifyOSC777;
}

function sendNotification(title: string, message: string, ctx: ExtensionContext): void {
  if (!canSendTerminalNotification()) return;

  const sender = getSender();
  if (!sender) {
    ctx.ui.notify(UNSUPPORTED_MESSAGE, "info");
    return;
  }

  sender(sanitizeNotificationText(title), sanitizeNotificationText(message));
}

function freshStats(): RunStats {
  return { turns: 0, toolCalls: 0, errors: 0, toolNames: new Set() };
}

function formatAgentEndMessage(stats: RunStats): string {
  const parts: string[] = [];
  if (stats.turns === 1) parts.push("1 turn");
  else if (stats.turns > 1) parts.push(`${stats.turns} turns`);

  if (stats.toolCalls > 0) {
    parts.push(`${stats.toolCalls} tool ${stats.toolCalls === 1 ? "call" : "calls"} (${stats.toolNames.size} unique)`);
  }
  if (stats.errors > 0) parts.push(`${stats.errors} ${stats.errors === 1 ? "error" : "errors"}`);

  return `${stats.errors > 0 ? "❌" : "✅"} Done — ${parts.join(", ") || "no tool calls"}`;
}

export default function notifyExtension(pi: ExtensionAPI): void {
  let stats = freshStats();

  pi.on("agent_start", () => {
    stats = freshStats();
  });
  pi.on("turn_end", () => {
    stats.turns++;
  });
  pi.on("tool_execution_end", (event) => {
    stats.toolCalls++;
    stats.toolNames.add(event.toolName);
    if (event.isError) stats.errors++;
  });
  pi.on("agent_end", (_event, ctx) => {
    sendNotification(TITLE, formatAgentEndMessage(stats), ctx);
  });

  pi.registerCommand("notify", {
    description: "Send a sanitized test terminal notification via OSC.",
    handler: (args, ctx) => {
      sendNotification(TITLE, `🔔 ${args.trim() || "Waiting for your input"}`, ctx);
      return Promise.resolve();
    },
  });
}
