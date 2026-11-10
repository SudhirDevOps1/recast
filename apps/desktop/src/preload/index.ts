import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, EVENTS, IPC_VERSION, assertIpcVersion, type IpcChannel, type IpcRequest, type IpcResponse, type EventChannel, type EventPayload } from '@recast/shared';

/**
 * The single typed bridge. Exposes exactly one object (`window.recast`) with:
 *  - `invoke(channel, payload)` — request/response, response zod-validated here
 *  - `on(event, handler)` — main→renderer events, payload zod-validated here
 *  - `send(channel, payload)` — fire-and-forget stats etc.
 * The contract version is asserted at startup so a mismatched bundle fails
 * loudly instead of subtly.
 */

assertIpcVersion(IPC_VERSION);

const api = {
  version: IPC_VERSION,

  async invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
    const contract = IPC[channel];
    if (!contract) throw new Error(`Unknown IPC channel: ${channel}`);
    const reqParse = contract.req.safeParse(payload ?? undefined);
    if (!reqParse.success) {
      throw new Error(`Invalid request for ${channel}: ${reqParse.error.issues[0]?.message ?? 'schema mismatch'}`);
    }
    const result = await ipcRenderer.invoke(channel, payload);
    if (result && typeof result === 'object' && '__error' in (result as Record<string, unknown>)) {
      throw new Error(String((result as Record<string, unknown>).__error));
    }
    const resParse = contract.res.safeParse(result);
    if (!resParse.success) {
      throw new Error(`Invalid response for ${channel}: ${resParse.error.issues[0]?.message ?? 'schema mismatch'}`);
    }
    return resParse.data as IpcResponse<C>;
  },

  on<C extends EventChannel>(event: C, handler: (payload: EventPayload<C>) => void): () => void {
    const schema = EVENTS[event];
    if (!schema) throw new Error(`Unknown event channel: ${event}`);
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => {
      const parsed = schema.safeParse(payload);
      if (parsed.success) handler(parsed.data as EventPayload<C>);
    };
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },

  send(channel: 'recorder:stats', payload: { phase: string; elapsedUs: number; bytes: number; micMeterDb?: number | null; sessionId?: string | null }): void {
    ipcRenderer.send(channel, payload);
  },

  /** File path for a dragged-in file (used by the Library import affordance). */
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld('recast', api);

export type RecastBridge = typeof api;
