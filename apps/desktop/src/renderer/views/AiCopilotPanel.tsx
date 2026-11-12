import { useState } from 'react';
import {
  Button,
  Field,
  IconSparkle,
  IconZoom,
  IconScissors,
  IconCrop,
  IconCheck,
  IconWarning,
  Badge,
} from '@recast/ui';
import type { RecastProject } from '@recast/shared';
import { bridge } from '../lib/bridge';
import { useApp, useEditor } from '../state/stores';

interface AiCopilotPanelProps {
  project: RecastProject;
  commit: (p: RecastProject) => void;
  setTime: (tUs: number) => void;
}

interface ActionLog {
  id: string;
  time: string;
  prompt: string;
  tool: string;
  detail: string;
  isError?: boolean;
}

const QUICK_ACTIONS = [
  {
    label: '9:16 Vertical Shorts',
    icon: <IconCrop size={12} />,
    prompt: 'Convert video composition to 9:16 vertical Shorts/Reels format',
    tool: 'recast_set_aspect_ratio',
    args: { ratio: '9:16' },
  },
  {
    label: 'Add 1.8x Zoom Block',
    icon: <IconZoom size={12} />,
    prompt: 'Add 1.8x zoom on center screen for 2.5 seconds',
    tool: 'recast_add_zoom_block',
    getArgs: (tSec: number) => ({
      startSec: tSec,
      endSec: tSec + 2.5,
      zoomFactor: 1.8,
      anchorX: 960,
      anchorY: 540,
      ease: 'out',
    }),
  },
  {
    label: 'Clean Video Mode',
    icon: <IconCheck size={12} />,
    prompt: 'Turn off synthetic cursor overlay to preserve native recorded cursor without duplicates',
    tool: 'recast_set_cursor_mode',
    args: { overlay: false },
  },
  {
    label: 'Apply Bold Punch Preset',
    icon: <IconSparkle size={12} />,
    prompt: 'Apply high-contrast Bold Punch frame and vibrant gradient background',
    tool: 'recast_apply_style_preset',
    args: { presetId: 'bold-punch' },
  },
  {
    label: 'Split at Playhead',
    icon: <IconScissors size={12} />,
    prompt: 'Split active clip at playhead position',
    tool: 'recast_split_clip',
    getArgs: (tSec: number) => ({ timeSec: tSec }),
  },
];

export function AiCopilotPanel({ project, setTime }: AiCopilotPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [executing, setExecuting] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const currentTimeUs = useEditor((s) => s.currentTimeUs);
  const showToast = useApp((s) => s.showToast);

  const executeMcpTool = async (name: string, args: Record<string, unknown>, userPrompt: string) => {
    setExecuting(true);
    try {
      const res = await bridge().invoke('mcp:callTool', { name, arguments: args });
      const text = res.content?.[0] && 'text' in res.content[0] ? String(res.content[0].text) : 'Action applied.';
      
      const newLog: ActionLog = {
        id: `log-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        prompt: userPrompt,
        tool: name,
        detail: text,
        isError: res.isError,
      };
      setLogs((prev) => [newLog, ...prev]);

      if (res.isError) {
        showToast(text, 'error');
      } else {
        showToast(text, 'success');
      }
    } catch (err) {
      showToast(`AI execution failed: ${(err as Error).message}`, 'error');
    } finally {
      setExecuting(false);
    }
  };

  const handleCustomPrompt = async () => {
    const q = prompt.trim();
    if (!q) return;
    setPrompt('');

    const currentSec = Number((currentTimeUs / 1e6).toFixed(2));
    const lower = q.toLowerCase();

    // Natural Language Intent Dispatcher
    if (lower.includes('9:16') || lower.includes('shorts') || lower.includes('reels') || lower.includes('vertical')) {
      await executeMcpTool('recast_set_aspect_ratio', { ratio: '9:16' }, q);
    } else if (lower.includes('16:9') || lower.includes('landscape') || lower.includes('youtube')) {
      await executeMcpTool('recast_set_aspect_ratio', { ratio: '16:9' }, q);
    } else if (lower.includes('split') || lower.includes('cut at playhead')) {
      await executeMcpTool('recast_split_clip', { timeSec: currentSec }, q);
    } else if (lower.includes('zoom')) {
      await executeMcpTool(
        'recast_add_zoom_block',
        {
          startSec: currentSec,
          endSec: currentSec + 2.5,
          zoomFactor: 1.8,
          anchorX: 960,
          anchorY: 540,
          ease: 'out',
        },
        q,
      );
    } else if (lower.includes('clean') || lower.includes('hide cursor') || lower.includes('double cursor') || lower.includes('native cursor')) {
      await executeMcpTool('recast_set_cursor_mode', { overlay: false }, q);
    } else if (lower.includes('preset') || lower.includes('bold') || lower.includes('punch')) {
      await executeMcpTool('recast_apply_style_preset', { presetId: 'bold-punch' }, q);
    } else if (lower.includes('sunset')) {
      await executeMcpTool('recast_apply_style_preset', { presetId: 'sunset' }, q);
    } else if (lower.includes('export')) {
      await executeMcpTool('recast_trigger_export', { presetId: 'youtube-1080p' }, q);
    } else if (lower.includes('subtitle') || lower.includes('caption') || lower.includes('whisper')) {
      await executeMcpTool('recast_generate_subtitles', { model: 'base', style: 'karaoke' }, q);
    } else {
      // Default: inspect state
      await executeMcpTool('recast_get_project_state', {}, q);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
            <IconSparkle size={14} />
            <span>Recast MCP & AI Copilot</span>
          </span>
          <Badge tone="accent">MCP Active</Badge>
        </div>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Command this video editor using natural language or connect external AI agents (Antigravity, Claude, Cursor) via standard MCP protocol.
        </p>
      </div>

      {/* Quick Action Chips */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Quick Actions</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={executing}
              onClick={() => {
                const currentSec = Number((currentTimeUs / 1e6).toFixed(2));
                const args = 'getArgs' in a && typeof a.getArgs === 'function' ? a.getArgs(currentSec) : (a as { args: Record<string, unknown> }).args;
                void executeMcpTool(a.tool, args, a.prompt);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/90 hover:text-white inline-flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Natural Language Prompt Input */}
      <Field label="Autonomous Command Prompt" hint="Type what you want the AI editor to do (e.g. 'Add zoom on playhead', 'Make it 9:16 Shorts', 'Split clip').">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCustomPrompt();
            }}
            placeholder="Describe video edit…"
            disabled={executing}
            className="rc-input flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={executing || !prompt.trim()}
            onClick={() => void handleCustomPrompt()}
          >
            <IconSparkle size={13} />
            <span>{executing ? 'Applying…' : 'Apply'}</span>
          </Button>
        </div>
      </Field>

      {/* Action Execution Logs */}
      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Execution History</span>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => useEditor.getState().undo()}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Undo Last Action
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-white/40 italic py-2">No AI commands executed yet in this session.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                  log.isError ? 'bg-red-950/20 border-red-500/30 text-red-200' : 'bg-white/5 border-white/10 text-white/80'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-white/50">
                  <span className="font-mono text-indigo-400">{log.tool}</span>
                  <span>{log.time}</span>
                </div>
                <div className="font-medium text-white/95">“{log.prompt}”</div>
                <div className="text-[11px] text-white/60 leading-normal">{log.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External MCP Connection Info */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] space-y-2 text-white/60">
        <div className="font-semibold text-white/80">Connect via External AI Agent (Claude / Cursor / Antigravity)</div>
        <p className="leading-relaxed">
          Add Recast to your MCP client configuration (`claude_desktop_config.json`):
        </p>
        <pre className="p-2 rounded bg-black/60 font-mono text-[10px] text-indigo-300 overflow-x-auto">
{`{
  "mcpServers": {
    "recast": {
      "command": "recast",
      "args": ["--mcp-server"]
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
