import { describe, expect, it } from 'vitest';
import { autoLineBreak, cuesAt, parseSrt, toSrt, toVtt, parseVtt } from '@recast/editor';
import { parseStyle, serializeStyle } from '@recast/editor';
import { BUILTIN_PRESETS, DEFAULT_PRESET_ID, getBuiltinPreset } from '@recast/shared';

describe('captions', () => {
  it('parses SRT', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,500\nHello world\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line';
    const cues = parseSrt(srt);
    expect(cues.length).toBe(2);
    expect(cues[0]!.startUs).toBe(1_000_000);
    expect(cues[0]!.endUs).toBe(2_500_000);
    expect(cues[0]!.text).toBe('Hello world');
  });

  it('parses VTT with header and round-trips', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello <b>world</b>';
    const cues = parseVtt(vtt);
    expect(cues.length).toBe(1);
    expect(cues[0]!.text).toBe('Hello world');
    const srt = toSrt(cues);
    expect(parseSrt(srt)[0]!.text).toBe('Hello world');
    expect(toVtt(cues).startsWith('WEBVTT')).toBe(true);
  });

  it('cuesAt filters by time', () => {
    const cues = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nA');
    expect(cuesAt(cues, 500_000).length).toBe(1);
    expect(cuesAt(cues, 1_500_000).length).toBe(0);
  });

  it('autoLineBreak wraps long text into two lines', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const out = autoLineBreak(text, 42);
    expect(out.split('\n').length).toBe(2);
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(42);
  });
});

describe('.recaststyle', () => {
  it('round-trips a builtin preset', () => {
    const preset = getBuiltinPreset(DEFAULT_PRESET_ID)!;
    const json = serializeStyle(preset);
    const { preset: back, error } = parseStyle(json);
    expect(error).toBeNull();
    expect(back).toEqual(preset);
  });

  it('rejects malformed presets with a precise error', () => {
    const { preset, error } = parseStyle('{"format":"recaststyle"}');
    expect(preset).toBeNull();
    expect(error).toContain('Invalid');
  });

  it('rejects invalid JSON', () => {
    const { preset, error } = parseStyle('not json');
    expect(preset).toBeNull();
    expect(error).toContain('Invalid JSON');
  });

  it('all seven builtins are valid', () => {
    expect(BUILTIN_PRESETS.length).toBe(7);
  });
});
