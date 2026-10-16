// C0 controls except \t (0x09) and \n (0x0a), plus DEL.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
// CSI / OSC / other ESC sequences.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

const ELLIPSIS = '…';

/** Strips ANSI escapes and control chars, then truncates to `max` chars with an ellipsis. No keyword scanning. */
export function sanitizeText(input: string, max: number): string {
  const clean = input.replace(ANSI, '').replace(CONTROL, '');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - ELLIPSIS.length))}${ELLIPSIS}`;
}
