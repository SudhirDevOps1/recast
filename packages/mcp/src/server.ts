import {
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpExecutionContext,
  MCP_PROTOCOL_VERSION,
} from './types.js';
import { RECAST_TOOLS, TOOL_HANDLERS } from './tools.js';
import { RECAST_RESOURCES, RESOURCE_HANDLERS } from './resources.js';

export class RecastMcpServer {
  private executionContext: McpExecutionContext;

  constructor(context: McpExecutionContext) {
    this.executionContext = context;
  }

  public setContext(context: McpExecutionContext): void {
    this.executionContext = context;
  }

  /** Handle raw JSON-RPC 2.0 MCP request string and produce response string. */
  public async handleMessage(rawMessage: string): Promise<string | null> {
    const trimmed = rawMessage.trim();
    if (!trimmed) return null;

    let req: McpJsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as McpJsonRpcRequest;
    } catch {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Invalid JSON received.' },
      });
    }

    const res = await this.handleRequest(req);
    return res ? JSON.stringify(res) : null;
  }

  /** Dispatch parsed JSON-RPC request to appropriate MCP handler. */
  public async handleRequest(req: McpJsonRpcRequest): Promise<McpJsonRpcResponse | null> {
    const { id, method, params } = req;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // Client completed initialization handshake
        return null;
      }
      return null;
    }

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: false, listChanged: true },
              },
              serverInfo: {
                name: 'recast-mcp-server',
                version: '0.0.4',
              },
            },
          };
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'tools/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: RECAST_TOOLS,
            },
          };
        }

        case 'tools/call': {
          const toolName = params?.name as string;
          const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
          const handler = TOOL_HANDLERS[toolName];
          if (!handler) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Unknown tool: "${toolName}"` },
            };
          }
          const output = await handler(toolArgs, this.executionContext);
          return {
            jsonrpc: '2.0',
            id,
            result: output,
          };
        }

        case 'resources/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: RECAST_RESOURCES,
            },
          };
        }

        case 'resources/read': {
          const uri = params?.uri as string;
          const handler = RESOURCE_HANDLERS[uri];
          if (!handler) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: `Resource not found: "${uri}"` },
            };
          }
          const output = await handler(uri, this.executionContext);
          return {
            jsonrpc: '2.0',
            id,
            result: output,
          };
        }

        default: {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
        }
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: `Internal error: ${(err as Error).message}` },
      };
    }
  }

  /** Run stdio transport loop for CLI `recast --mcp`. */
  public startStdioTransport(): void {
    const readline = (async () => {
      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, terminal: false });
      rl.on('line', async (line) => {
        const response = await this.handleMessage(line);
        if (response) {
          process.stdout.write(`${response}\n`);
        }
      });
    })();
    void readline;
  }
}
