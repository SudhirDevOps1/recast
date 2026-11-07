# Keyboard shortcuts

Status: specification. The shortcut map ships in-app under **Settings → Shortcuts** and is searchable from the command palette.

`⌘` on macOS, `Ctrl` elsewhere unless noted.

## Global (work anywhere)

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + Shift + R` | Start recording (last used source) |
| `⌘/Ctrl + Shift + S` | Stop recording |
| `⌘/Ctrl + Shift + P` | Pause / resume |
| `⌘/Ctrl + Shift + D` | Toggle drawing overlay |
| `⌘/Ctrl + Shift + M` | Mute / unmute microphone |
| `Esc` | Cancel countdown or selection |

Global shortcuts are user-editable and must detect conflicts before saving.

## App

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + K` | Command palette |
| `⌘/Ctrl + N` | New recording |
| `⌘/Ctrl + O` | Open project |
| `⌘/Ctrl + ,` | Settings |
| `⌘/Ctrl + Shift + E` | Export |
| `⌘/Ctrl + Shift + P` | Toggle play/pause (editor only) |
| `F1` | Shortcut cheatsheet |

## Editor

| Shortcut | Action |
|---|---|
| `Space` | Play / pause |
| `J` / `K` / `L` | Reverse / pause / forward |
| `I` / `O` | Set in / out point |
| `←` / `→` | Step one frame |
| `Shift + ←/→` | Step one second |
| `Home` / `End` | Jump to start / end |
| `S` | Split at playhead |
| `Delete` | Delete selection |
| `Shift + Delete` | Ripple delete |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` | Redo |
| `⌘/Ctrl + D` | Duplicate clip |
| `+` / `-` | Zoom timeline in / out |
| `F` | Fit timeline to window |
| `M` | Add marker |
| `Z` | Zoom tool |
| `C` | Cursor tool |
| `T` | Text annotation |
| `B` | Blur / redact tool |

## Recording overlay

| Shortcut | Action |
|---|---|
| `1` – `9` | Select drawing tool |
| `[` / `]` | Decrease / increase brush size |
| `⌘/Ctrl + Z` | Undo last stroke |
| `H` | Toggle highlighter |
| `Space` | Toggle spotlight |

## Rules

- Never bind a shortcut that the OS reserves. Check conflicts on startup and surface them.
- Users can remap everything except `Esc` and the stop-recording shortcut.
- Shortcuts must work when focus is in the timeline or canvas, but not while typing in a text field.
- Every action in the UI shows its shortcut in the tooltip.
