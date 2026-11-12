import type { McpResourceDefinition, McpResourceHandler } from './types.js';

export const RECAST_RESOURCES: McpResourceDefinition[] = [
  {
    uri: 'recast://project/current',
    name: 'Current Project JSON',
    description: 'Complete serialized state of the currently active Recast video editing project.',
    mimeType: 'application/json',
  },
  {
    uri: 'recast://timeline/summary',
    name: 'Timeline Summary',
    description: 'Human-readable and LLM-friendly summary of timeline duration, segments, zoom keyframes, and speech subtitles.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'recast://captions/transcript',
    name: 'Speech Subtitle Transcript',
    description: 'Timestamped SRT speech transcript generated from on-device Whisper AI.',
    mimeType: 'text/plain',
  },
  {
    uri: 'recast://canvas/snapshot',
    name: 'Preview Canvas Snapshot',
    description: 'Base64-encoded PNG image of the compositor canvas at the current playhead position.',
    mimeType: 'image/png',
  },
];

export const RESOURCE_HANDLERS: Record<string, McpResourceHandler> = {
  'recast://project/current': async (uri, ctx) => {
    const p = ctx.getProject();
    if (!p) {
      return { contents: [{ uri, mimeType: 'application/json', text: 'null' }] };
    }
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(p, null, 2) }],
    };
  },

  'recast://timeline/summary': async (uri, ctx) => {
    const p = ctx.getProject();
    if (!p) {
      return { contents: [{ uri, mimeType: 'text/markdown', text: '# No Active Project\nOpen or import a video first.' }] };
    }
    const durSec = (p.timeline.durationUs / 1_000_000).toFixed(1);
    const md = [
      `# Project: ${p.name}`,
      `- **Duration**: ${durSec} seconds (${p.timeline.clips.length} clip segments)`,
      `- **Media Source**: ${p.media.width}x${p.media.height} @ ${p.media.fps} fps`,
      `- **Zoom Keyframes**: ${p.zoom.manualKeyframes?.length ?? 0} manual, ${p.zoom.autoKeyframes?.length ?? 0} auto`,
      `- **Cursor Overlay**: ${p.style.cursor.look !== 'none' ? `Enabled (${p.style.cursor.look})` : 'Disabled (Clean Native Cursor)'}`,
      `- **Style Preset**: ${p.style.name} (Padding: ${p.style.frame.paddingPx}px, Radius: ${p.style.frame.radiusPx}px)`,
      `- **Subtitles**: ${p.captions ? `Linked (${p.captions.language || 'auto'})` : 'None'}`,
    ].join('\n');
    return {
      contents: [{ uri, mimeType: 'text/markdown', text: md }],
    };
  },

  'recast://captions/transcript': async (uri, ctx) => {
    const p = ctx.getProject();
    if (!p || !p.captions) {
      return { contents: [{ uri, mimeType: 'text/plain', text: 'No speech subtitles loaded for this project.' }] };
    }
    return {
      contents: [{ uri, mimeType: 'text/plain', text: `Captions metadata: file=${p.captions.file}, language=${p.captions.language}, source=${p.captions.source}` }],
    };
  },

  'recast://canvas/snapshot': async (uri, ctx) => {
    if (!ctx.getCanvasSnapshot) {
      return { contents: [{ uri, mimeType: 'text/plain', text: 'Canvas snapshot capture is not available in headless mode.' }] };
    }
    const base64 = await ctx.getCanvasSnapshot();
    if (!base64) {
      return { contents: [{ uri, mimeType: 'text/plain', text: 'Could not capture current preview frame.' }] };
    }
    return {
      contents: [{ uri, mimeType: 'image/png', blob: base64 }],
    };
  },
};
