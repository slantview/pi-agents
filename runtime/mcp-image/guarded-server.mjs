import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCPServerImpl } from "./node_modules/mcp-image/dist/server/mcpServer.js";

import { assertContainedImagePath } from "./policy.mjs";

class GuardedMcpImageServer extends MCPServerImpl {
  async callTool(name, args) {
    let guardedArgs = args;
    if (name === "generate_image" && args && typeof args === "object" && !Array.isArray(args) && typeof args.inputImagePath === "string") {
      guardedArgs = {
        ...args,
        inputImagePath: assertContainedImagePath(process.env.IMAGE_INPUT_DIR ?? "", args.inputImagePath),
      };
    }
    return super.callTool(name, guardedArgs);
  }
}

const implementation = new GuardedMcpImageServer();
const server = implementation.initialize();
const transport = new StdioServerTransport();
await server.connect(transport);
