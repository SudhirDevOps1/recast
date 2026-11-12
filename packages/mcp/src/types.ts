export const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type McpToolHandler = (args: Record<string, unknown>, context: McpExecutionContext) => Promise<{
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}>;

export type McpResourceHandler = (uri: string, context: McpExecutionContext) => Promise<{
  contents: Array<{ uri: string; mimeType: string; text?: string; blob?: string }>;
}>;

export interface McpExecutionContext {
  getProject: () => import('@recast/shared').RecastProject | null;
  updateProject: (mutator: (p: import('@recast/shared').RecastProject) => import('@recast/shared').RecastProject) => Promise<import('@recast/shared').RecastProject>;
  getCanvasSnapshot?: () => Promise<string | null>; // base64 png
  triggerExport?: (presetId: string, outPath?: string) => Promise<{ exportId: string }>;
  generateSubtitles?: (modelId?: string) => Promise<{ ok: boolean; srt: string | null; error?: string }>;
  seekTo?: (timeUs: number) => void;
}
