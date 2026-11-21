/**
 * The height the app frame should have. iOS reports a half-height visual viewport for a moment when the installed app comes back
 * from the background, which left the bottom menu stuck in the middle of the screen until the page loaded again. A visual viewport much
 * shorter than the window is only believed while a field is being typed in (the keyboard is up); otherwise the window height is used.
 */
export function appHeight(visual: number | null | undefined, inner: number, editing: boolean): number {
  const v = typeof visual === "number" && Number.isFinite(visual) && visual > 0 ? Math.round(visual) : 0;
  const w = Number.isFinite(inner) && inner > 0 ? Math.round(inner) : 0;
  if (!v) return w;
  if (!w) return v;
  if (v < w * 0.75 && !editing) return w; // a transient value, not a keyboard
  return Math.min(v, w);
}

/**
 * The installed iPhone app with the see-through status bar: the window height reported by iOS leaves out the status bar strip, so a frame
 * that long stops short of the bottom (the menu floats above the screen edge). The app really covers the whole screen, so use the screen's
 * long side in portrait and its short side in landscape (iOS never swaps screen.width/height when rotating).
 */
export function standaloneHeight(screenW: number, screenH: number, landscape: boolean, editing: boolean): number {
  if (editing || !(screenW > 0) || !(screenH > 0)) return 0;
  return Math.round(landscape ? Math.min(screenW, screenH) : Math.max(screenW, screenH));
}
