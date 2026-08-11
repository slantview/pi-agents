import { sanitizeTerminalLine, sanitizeTerminalText } from "../shared/terminal-text.ts";

export function sanitizeSubagentText(value: string): string {
  return sanitizeTerminalText(value);
}

export function sanitizeSubagentLine(value: string): string {
  return sanitizeTerminalLine(value);
}

export function normalizeToolArguments(value: unknown): Record<string, unknown> {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return candidate as Record<string, unknown>;
}
