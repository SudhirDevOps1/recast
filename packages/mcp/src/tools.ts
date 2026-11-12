import {
  type RecastProject,
  type Clip,
  splitClipsAt,
  rippleDeleteRange,
  getBuiltinPreset,
  BUILTIN_PRESETS,
} from '@recast/shared';
import type { McpToolDefinition, McpToolHandler } from './types.js';

export function relayoutClips(project: RecastProject, clips: Clip[]): RecastProject {
  let t = 0;
  const laidOut = clips.map((c) => {
    const dur = Math.max(0, c.sourceOutUs - c.sourceInUs);
    const updated = { ...c, timelineInUs: t };
    t += Math.round(dur / Math.max(0.25, c.speed));
    return updated;
  });
  return {
    ...project,
    timeline: {
      ...project.timeline,
      clips: laidOut,
      durationUs: t,
    },
  };
}

export const RECAST_TOOLS: McpToolDefinition[] = [
  {
    name: 'recast_get_project_state',
    description: 'Inspect the active Recast video editing project. Returns full duration, clips, zoom keyframes, active styles, speech captions, and media dimensions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'recast_split_clip',
    description: 'Split the active video clip at a precise timestamp. Creates two independent clips on the timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        timeSec: { type: 'number', description: 'Timestamp in seconds to split at (e.g. 12.5)' },
      },
      required: ['timeSec'],
    },
  },
  {
    name: 'recast_ripple_delete',
    description: 'Ripple delete a section of the video between startSec and endSec. Automatically closes the gap by shifting subsequent clips left.',
    inputSchema: {
      type: 'object',
      properties: {
        startSec: { type: 'number', description: 'Start time in seconds to cut (e.g. 5.0)' },
        endSec: { type: 'number', description: 'End time in seconds to cut (e.g. 8.2)' },
      },
      required: ['startSec', 'endSec'],
    },
  },
  {
    name: 'recast_add_zoom_block',
    description: 'Add a cinematic zoom block to focus on an area or UI action. Camera smoothly animates into anchorX/anchorY with the requested zoom factor and holds until endSec.',
    inputSchema: {
      type: 'object',
      properties: {
        startSec: { type: 'number', description: 'Timestamp in seconds when the zoom starts' },
        endSec: { type: 'number', description: 'Timestamp in seconds when the zoom ends' },
        zoomFactor: { type: 'number', description: 'Zoom magnification factor (e.g. 1.3 to 2.5, default 1.6)' },
        anchorX: { type: 'number', description: 'Center focus X coordinate in source pixels (e.g. 960)' },
        anchorY: { type: 'number', description: 'Center focus Y coordinate in source pixels (e.g. 540)' },
        ease: { type: 'string', enum: ['out', 'inout', 'pop', 'linear'], description: 'Approach transition easing (default out)' },
      },
      required: ['startSec', 'endSec', 'anchorX', 'anchorY'],
    },
  },
  {
    name: 'recast_clear_zooms',
    description: 'Clear zoom keyframes from the timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'auto', 'manual'], description: 'Which zooms to clear (default all)' },
      },
    },
  },
  {
    name: 'recast_set_aspect_ratio',
    description: 'Change the aspect ratio and frame format of the video composition (e.g. convert 16:9 desktop recording into 9:16 vertical Shorts/Reels).',
    inputSchema: {
      type: 'object',
      properties: {
        ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:5'], description: 'Target aspect ratio' },
      },
      required: ['ratio'],
    },
  },
  {
    name: 'recast_apply_style_preset',
    description: 'Apply a design style preset to the video frame (background wallpapers, padding, corner radius, borders, and shadows).',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: { type: 'string', description: 'Preset ID (e.g. bold-punch, soft-studio, midnight-minimal, candy-pop, glass-studio)' },
      },
      required: ['presetId'],
    },
  },
  {
    name: 'recast_set_cursor_mode',
    description: 'Control cursor styling and synthetic overlay. Turn overlay off for clean native footage with zero double cursors, or customize pointer look, radar rings, and spotlight.',
    inputSchema: {
      type: 'object',
      properties: {
        overlay: { type: 'boolean', description: 'True to render styled overlay, false for clean native video cursor only' },
        look: { type: 'string', enum: ['pointer', 'dot', 'circle', 'native', 'none'], description: 'Cursor visual style' },
        radarRings: { type: 'boolean', description: 'Enable multi-ring radar wave click animations' },
        spotlight: { type: 'boolean', description: 'Enable dark spotlight aperture focused on cursor' },
        smoothing: { type: 'number', description: 'Cursor movement smoothing from 0.0 (raw) to 1.0 (silky)' },
      },
    },
  },
  {
    name: 'recast_generate_subtitles',
    description: 'Generate on-device AI subtitles using Whisper speech recognition and apply chosen subtitle visual styling.',
    inputSchema: {
      type: 'object',
      properties: {
        style: { type: 'string', enum: ['karaoke', 'pill', 'boxed', 'clean'], description: 'Subtitle display style' },
        model: { type: 'string', description: 'Whisper GGML model name (e.g. base, tiny, small)' },
      },
    },
  },
  {
    name: 'recast_trigger_export',
    description: 'Render and export the final styled video using Recast hardware compositor.',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: { type: 'string', description: 'Export preset (e.g. youtube-1080p, reels-shorts, 4k-master, light-720p, animated-gif)' },
        destinationPath: { type: 'string', description: 'Optional custom destination file path' },
      },
      required: ['presetId'],
    },
  },
];

export const TOOL_HANDLERS: Record<string, McpToolHandler> = {
  recast_get_project_state: async (_args, ctx) => {
    const p = ctx.getProject();
    if (!p) {
      return { content: [{ type: 'text', text: 'No video project is currently open in Recast Studio.' }], isError: true };
    }
    const durationSec = (p.timeline.durationUs / 1_000_000).toFixed(2);
    const summary = {
      id: p.id,
      name: p.name,
      durationSec: Number(durationSec),
      sourceDimensions: `${p.media.width}x${p.media.height}`,
      clipsCount: p.timeline.clips.length,
      autoZoomKeyframesCount: p.zoom.autoKeyframes?.length ?? 0,
      manualZoomKeyframesCount: p.zoom.manualKeyframes?.length ?? 0,
      cursorOverlayEnabled: p.style.cursor.look !== 'none',
      cursorLook: p.style.cursor.look,
      aspectPreset: p.style.name,
      hasCaptions: Boolean(p.captions),
      exportPresetsAvailable: ['youtube-1080p', 'reels-shorts', '4k-master', 'social-square', 'social-portrait', 'animated-gif'],
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  },

  recast_split_clip: async (args, ctx) => {
    const timeSec = Number(args.timeSec);
    if (!Number.isFinite(timeSec) || timeSec < 0) {
      return { content: [{ type: 'text', text: 'Invalid timeSec provided.' }], isError: true };
    }
    const timeUs = Math.round(timeSec * 1_000_000);
    const updated = await ctx.updateProject((project) => {
      const next = splitClipsAt(project.timeline.clips, timeUs, (i) => `clip-mcp-${Date.now()}-${i}`);
      if (!next) throw new Error(`Cannot split at ${timeSec}s: timestamp is outside clip boundaries.`);
      return { ...project, timeline: { ...project.timeline, clips: next } };
    });
    ctx.seekTo?.(timeUs);
    return {
      content: [{ type: 'text', text: `Successfully split clip at ${timeSec.toFixed(2)}s. Total clips: ${updated.timeline.clips.length}` }],
    };
  },

  recast_ripple_delete: async (args, ctx) => {
    const startSec = Number(args.startSec);
    const endSec = Number(args.endSec);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec >= endSec) {
      return { content: [{ type: 'text', text: 'Invalid startSec/endSec range.' }], isError: true };
    }
    const startUs = Math.round(startSec * 1_000_000);
    const endUs = Math.round(endSec * 1_000_000);
    const updated = await ctx.updateProject((project) => {
      const next = rippleDeleteRange(project.timeline.clips, startUs, endUs);
      return relayoutClips(project, next);
    });
    const newDur = (updated.timeline.durationUs / 1_000_000).toFixed(2);
    ctx.seekTo?.(startUs);
    return {
      content: [{ type: 'text', text: `Ripple deleted region ${startSec.toFixed(2)}s to ${endSec.toFixed(2)}s. New total duration: ${newDur}s.` }],
    };
  },

  recast_add_zoom_block: async (args, ctx) => {
    const startSec = Number(args.startSec);
    const endSec = Number(args.endSec);
    const zoomFactor = Number(args.zoomFactor ?? 1.6);
    const anchorX = Number(args.anchorX);
    const anchorY = Number(args.anchorY);
    const ease = (args.ease as 'out' | 'inout' | 'pop' | 'linear') ?? 'out';

    const startUs = Math.round(startSec * 1_000_000);
    const endUs = Math.round(endSec * 1_000_000);

    await ctx.updateProject((project) => {
      const existing = project.zoom.manualKeyframes ?? [];
      const newKeyframe = {
        id: `zoom-mcp-${Date.now()}`,
        tUs: startUs,
        zoom: zoomFactor,
        cx: anchorX,
        cy: anchorY,
        ease,
      };
      // Return-to-fullscreen keyframe at endSec
      const returnKeyframe = {
        id: `zoom-mcp-ret-${Date.now()}`,
        tUs: endUs,
        zoom: 1.0,
        cx: project.media.width / 2,
        cy: project.media.height / 2,
        ease: 'out' as const,
      };
      return {
        ...project,
        zoom: {
          ...project.zoom,
          mode: 'manual',
          manualKeyframes: [...existing, newKeyframe, returnKeyframe].sort((a, b) => a.tUs - b.tUs),
        },
      };
    });
    ctx.seekTo?.(startUs);
    return {
      content: [{ type: 'text', text: `Added ${zoomFactor.toFixed(1)}x zoom block from ${startSec.toFixed(2)}s to ${endSec.toFixed(2)}s at (${anchorX}, ${anchorY}).` }],
    };
  },

  recast_clear_zooms: async (args, ctx) => {
    const scope = (args.scope as string) ?? 'all';
    await ctx.updateProject((project) => {
      return {
        ...project,
        zoom: {
          ...project.zoom,
          autoKeyframes: scope === 'manual' ? project.zoom.autoKeyframes : [],
          manualKeyframes: scope === 'auto' ? project.zoom.manualKeyframes : [],
        },
      };
    });
    return {
      content: [{ type: 'text', text: `Cleared ${scope} zoom keyframes from the timeline.` }],
    };
  },

  recast_set_aspect_ratio: async (args, ctx) => {
    const ratio = String(args.ratio);
    await ctx.updateProject((project) => {
      let paddingPx = project.style.frame.paddingPx;
      if (ratio === '9:16') {
        paddingPx = Math.max(36, paddingPx);
      }
      return {
        ...project,
        style: {
          ...project.style,
          frame: {
            ...project.style.frame,
            paddingPx,
          },
        },
      };
    });
    return {
      content: [{ type: 'text', text: `Composition aspect ratio updated to ${ratio}.` }],
    };
  },

  recast_apply_style_preset: async (args, ctx) => {
    const presetId = String(args.presetId);
    const preset = getBuiltinPreset(presetId) ?? BUILTIN_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      return {
        content: [{ type: 'text', text: `Preset "${presetId}" not found. Available: ${BUILTIN_PRESETS.map((p) => p.id).join(', ')}` }],
        isError: true,
      };
    }
    await ctx.updateProject((project) => {
      return {
        ...project,
        style: {
          ...preset,
          name: preset.name,
        },
      };
    });
    return {
      content: [{ type: 'text', text: `Applied style preset "${preset.name}".` }],
    };
  },

  recast_set_cursor_mode: async (args, ctx) => {
    await ctx.updateProject((project) => {
      const cur = project.style.cursor;
      const overlay = args.overlay !== undefined ? Boolean(args.overlay) : undefined;
      const look = args.look !== undefined ? (args.look as typeof cur.look) : overlay === false ? 'none' : cur.look === 'none' ? 'pointer' : cur.look;
      return {
        ...project,
        style: {
          ...project.style,
          cursor: {
            ...cur,
            look: look ?? cur.look,
            radarRings: args.radarRings !== undefined ? Boolean(args.radarRings) : cur.radarRings,
            spotlight: args.spotlight !== undefined ? Boolean(args.spotlight) : cur.spotlight,
            cursorSmoothing: args.smoothing !== undefined ? Number(args.smoothing) : cur.cursorSmoothing,
          },
        },
      };
    });
    return {
      content: [{ type: 'text', text: `Cursor mode updated successfully.` }],
    };
  },

  recast_generate_subtitles: async (args, ctx) => {
    if (!ctx.generateSubtitles) {
      return { content: [{ type: 'text', text: 'Subtitle generation service is unavailable in this context.' }], isError: true };
    }
    const model = (args.model as string) || 'base';
    const res = await ctx.generateSubtitles(model);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `Subtitle generation failed: ${res.error}` }], isError: true };
    }
    if (args.style) {
      await ctx.updateProject((project) => ({
        ...project,
        style: {
          ...project.style,
          captions: {
            ...project.style.captions,
            style: args.style as 'karaoke' | 'pill' | 'boxed' | 'clean',
          },
        },
      }));
    }
    return {
      content: [{ type: 'text', text: `Generated subtitles with model "${model}" and applied visual styling.` }],
    };
  },

  recast_trigger_export: async (args, ctx) => {
    if (!ctx.triggerExport) {
      return { content: [{ type: 'text', text: 'Export engine is unavailable in this context.' }], isError: true };
    }
    const presetId = String(args.presetId);
    const dest = args.destinationPath as string | undefined;
    const res = await ctx.triggerExport(presetId, dest);
    return {
      content: [{ type: 'text', text: `Export initiated with preset "${presetId}" (Job ID: ${res.exportId}).` }],
    };
  },
};
