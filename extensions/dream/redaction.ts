import { sanitizeTerminalText } from "../shared/terminal-text.ts";

export interface RedactionResult {
  text: string;
  redactions: number;
}

const replaceAndCount = (
  value: string,
  pattern: RegExp,
  replacement: string | ((...args: any[]) => string),
): RedactionResult => {
  let redactions = 0;
  const text = value.replace(pattern, (...args) => {
    redactions++;
    return typeof replacement === "string" ? replacement : replacement(...args);
  });
  return { text, redactions };
};

export function redactSensitiveText(input: string): RedactionResult {
  let text = input;
  let redactions = 0;
  const apply = (pattern: RegExp, replacement: string | ((...args: any[]) => string)) => {
    const result = replaceAndCount(text, pattern, replacement);
    text = result.text;
    redactions += result.redactions;
  };

  apply(/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/giu, "[REDACTED PRIVATE KEY]");
  apply(/(\bauthorization\s*:\s*bearer\s+)[^\s,;]+/giu, (_match, prefix) => `${prefix}[REDACTED]`);
  apply(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/gu, "[REDACTED JWT]");
  apply(/\b(?:gh[opusr]_[A-Za-z0-9_]{16,}|sk-(?:live|test|proj)-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/gu, "[REDACTED TOKEN]");
  apply(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\b\s*[=:]\s*["']?)[^\s"',;]+/giu, (_match, prefix) => `${prefix}[REDACTED]`);
  apply(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@");

  const sanitized = sanitizeTerminalText(text);
  if (sanitized !== text) redactions++;
  return { text: sanitized, redactions };
}
