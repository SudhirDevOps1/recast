/**
 * Caption parsing and serialization: `.srt` and `.vtt`, plus automatic line
 * breaking for burn-in rendering. Fully local — no network involved.
 */

export interface CaptionCue {
  startUs: number;
  endUs: number;
  text: string;
}

function parseTimestamp(s: string): number {
  // srt: 00:00:01,600  vtt: 00:00:01.600
  const m = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(s);
  if (!m) {
    const m2 = /(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(s);
    if (!m2) return 0;
    return (Number(m2[1]) * 60 + Number(m2[2])) * 1_000_000 + Number(m2[3].padEnd(3, '0')) * 1_000;
  }
  const [, h, mnt, sec, ms] = m;
  return (Number(h) * 3600 + Number(mnt) * 60 + Number(sec)) * 1_000_000 + Number(ms.padEnd(3, '0')) * 1_000;
}

function formatTimestamp(us: number, sep: ','): string;
function formatTimestamp(us: number, sep: '.'): string;
function formatTimestamp(us: number, sep: ',' | '.'): string {
  const total = Math.max(0, Math.round(us / 1_000));
  const ms = total % 1_000;
  const s = Math.floor(total / 1_000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

export function parseSrt(content: string): CaptionCue[] {
  return parseBlocks(content.replace(/\r\n/g, '\n').split('\n\n'));
}

export function parseVtt(content: string): CaptionCue[] {
  const body = content.replace(/\r\n/g, '\n');
  const stripped = body.startsWith('WEBVTT') ? body.split('\n').slice(1).join('\n') : body;
  return parseBlocks(stripped.split('\n\n'));
}

function parseBlocks(blocks: string[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx < 0) continue;
    const [from, to] = lines[timingIdx]!.split('-->');
    if (!from || !to) continue;
    const text = lines
      .slice(timingIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    cues.push({ startUs: parseTimestamp(from.trim()), endUs: parseTimestamp(to.trim().split(' ')[0] ?? to.trim()), text });
  }
  return cues.sort((a, b) => a.startUs - b.startUs);
}

export function toSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${formatTimestamp(c.startUs, ',')} --> ${formatTimestamp(c.endUs, ',')}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

export function toVtt(cues: CaptionCue[]): string {
  return (
    'WEBVTT\n\n' +
    cues
      .map((c) => `${formatTimestamp(c.startUs, '.')} --> ${formatTimestamp(c.endUs, '.')}\n${c.text}`)
      .join('\n\n') +
    '\n'
  );
}

/** Two-line max, ~42 chars per line — readable burn-in for 16:9 and vertical. */
export function autoLineBreak(text: string, maxChars = 42): string {
  if (text.length <= maxChars) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2).join('\n');
}

/** Cues active at time t (may be two adjacent cues during a cross-fade later). */
export function cuesAt(cues: CaptionCue[], tUs: number): CaptionCue[] {
  return cues.filter((c) => tUs >= c.startUs && tUs <= c.endUs);
}
