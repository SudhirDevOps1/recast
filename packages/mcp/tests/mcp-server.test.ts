import { describe, it, expect } from 'vitest';
import { RecastMcpServer } from '../src/server.js';
import type { RecastProject } from '@recast/shared';
import { makeEmptyProject, DEFAULT_PRESET_ID, getBuiltinPreset } from '@recast/shared';

function createMockProject(): RecastProject {
  const preset = getBuiltinPreset(DEFAULT_PRESET_ID)!;
  const p = makeEmptyProject('prj-test-123', 'Test Video', new Date().toISOString(), preset);
  p.media = {
    dir: '/mock/session',
    width: 1920,
    height: 1080,
    fps: 30,
    segments: [
      { id: 'seg-1', file: 'seg-1.mp4', startUs: 0, endUs: 10_000_000, width: 1920, height: 1080, sizeBytes: 5000 },
      { id: 'seg-2', file: 'seg-2.mp4', startUs: 10_000_000, endUs: 20_000_000, width: 1920, height: 1080, sizeBytes: 5000 },
    ],
    audio: null,
    camera: null,
    cursor: { file: 'cursor.jsonl', available: true },
  };
  p.timeline.clips = [
    { id: 'clip-1', segmentId: 'seg-1', track: 'screen', sourceInUs: 0, sourceOutUs: 10_000_000, timelineInUs: 0, speed: 1, transitionIn: 'none', transitionMs: 450 },
    { id: 'clip-2', segmentId: 'seg-2', track: 'screen', sourceInUs: 0, sourceOutUs: 10_000_000, timelineInUs: 10_000_000, speed: 1, transitionIn: 'none', transitionMs: 450 },
  ];
  p.timeline.durationUs = 20_000_000;
  return p;
}

describe('RecastMcpServer', () => {
  it('handles initialize handshake', async () => {
    let mock = createMockProject();
    const server = new RecastMcpServer({
      getProject: () => mock,
      updateProject: async (mutator) => (mock = mutator(mock)),
    });

    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    expect(res).toBeDefined();
    expect(res?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'recast-mcp-server' },
    });
  });

  it('lists all registered video editing tools', async () => {
    let mock = createMockProject();
    const server = new RecastMcpServer({
      getProject: () => mock,
      updateProject: async (mutator) => (mock = mutator(mock)),
    });

    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const tools = (res?.result as { tools: Array<{ name: string }> })?.tools;
    expect(tools.length).toBeGreaterThanOrEqual(8);
    expect(tools.some((t) => t.name === 'recast_add_zoom_block')).toBe(true);
    expect(tools.some((t) => t.name === 'recast_ripple_delete')).toBe(true);
    expect(tools.some((t) => t.name === 'recast_set_cursor_mode')).toBe(true);
  });

  it('executes recast_add_zoom_block and updates project keyframes', async () => {
    let mock = createMockProject();
    const server = new RecastMcpServer({
      getProject: () => mock,
      updateProject: async (mutator) => (mock = mutator(mock)),
    });

    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'recast_add_zoom_block',
        arguments: {
          startSec: 2.0,
          endSec: 5.0,
          zoomFactor: 1.8,
          anchorX: 960,
          anchorY: 540,
        },
      },
    });

    expect(res?.result).toBeDefined();
    expect(mock.zoom.manualKeyframes?.length).toBe(2);
    expect(mock.zoom.manualKeyframes?.[0]?.zoom).toBe(1.8);
    expect(mock.zoom.manualKeyframes?.[1]?.zoom).toBe(1.0); // return keyframe
  });

  it('executes recast_set_cursor_mode to toggle clean video mode', async () => {
    let mock = createMockProject();
    const server = new RecastMcpServer({
      getProject: () => mock,
      updateProject: async (mutator) => (mock = mutator(mock)),
    });

    await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'recast_set_cursor_mode',
        arguments: { overlay: false },
      },
    });

    expect(mock.style.cursor.look).toBe('none');
  });

  it('reads timeline summary resource', async () => {
    let mock = createMockProject();
    const server = new RecastMcpServer({
      getProject: () => mock,
      updateProject: async (mutator) => (mock = mutator(mock)),
    });

    const res = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'recast://timeline/summary' },
    });

    const content = (res?.result as { contents: Array<{ text: string }> })?.contents?.[0]?.text;
    expect(content).toContain('Test Video');
    expect(content).toContain('20.0 seconds');
  });
});
