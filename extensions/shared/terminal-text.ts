const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/gu;

/**
 * Neutralize terminal controls in untrusted session, model, tool, and MCP text.
 * Newlines are retained for preview layout; all other C0/C1 and bidi controls
 * are removed so attacker-provided ANSI/OSC/DCS sequences become inert text.
 */
export function sanitizeTerminalText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/\t/gu, " ")
    .replace(UNSAFE_TERMINAL_CONTROLS, "");
}

export function sanitizeTerminalLine(value: string): string {
  return sanitizeTerminalText(value).replace(/\s+/gu, " ").trim();
}
