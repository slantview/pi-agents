import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createMcpAdapter } from "pi-mcp-adapter";

import { loadIsolatedMcpConfig } from "./config.ts";

/**
 * Programmatic configuration mode is intentionally isolated from project MCP
 * files and ambient host imports. See pi-mcp-adapter's SDK configuration contract.
 */
export default function isolatedMcpAdapter(pi: ExtensionAPI): void {
  // pi-mcp-adapter command resolvers use a system shell. Remove inherited shell
  // and dynamic-loader startup hooks before any resolver can run.
  for (const name of [
    "BASH_ENV",
    "BASHOPTS",
    "CDPATH",
    "ENV",
    "GLOBIGNORE",
    "SHELLOPTS",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
  ]) {
    delete process.env[name];
  }

  const extension = createMcpAdapter({
    config: loadIsolatedMcpConfig(getAgentDir()),
  });
  extension(pi);
}
