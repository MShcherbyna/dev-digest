/** Layout units are SVG user units; the SVG scales to the card width via its viewBox. */
export const VIEW_W = 560;
export const NODE_H = 34;
export const ROW_H = 54;
export const PAD_Y = 6;

export const SYMBOL_X = 0;
export const SYMBOL_MIN_W = 90;
export const SYMBOL_MAX_W = 150;

export const CALLER_X = 215;
export const CALLER_W = 140;

/** Wider than the space left on purpose: the right edge is clipped, as in 4.png. */
export const ENDPOINT_X = 410;
export const ENDPOINT_W = 200;

/** Monospace 13px advance, used to size the symbol node and cut labels. */
export const CHAR_W = 7.8;
export const NODE_PAD_X = 14;
export const CALLER_MAX_CHARS = 16;
export const ENDPOINT_MAX_CHARS = 15;
