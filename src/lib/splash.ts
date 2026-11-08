/** iPhone and iPad sizes that have a launch image in public/splash (made by scripts/make-splash.py). */
const DEVICES: [number, number, number][] = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [834, 1112, 2], [768, 1024, 2],
];

/** What iOS shows the instant the home-screen icon is tapped, before any page code runs. */
export const startupImages = DEVICES.map(([w, h, r]) => ({
  url: `/splash/launch-${w * r}x${h * r}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));

/**
 * Opening screen styles. They are written into the page head (not the stylesheet file) because the browser shows
 * nothing, or a black screen, until the stylesheet has downloaded; inline CSS lets the white screen paint with the
 * very first bytes of HTML. The white page colour only applies when launched from the home screen.
 */
export const SPLASH_CSS = `@media all and (display-mode: standalone), all and (display-mode: fullscreen) { html { background: #ffffff; } html.dark { background: #0b1020; } }
#app-splash {
  display: none;
}
@media all and (display-mode: standalone), all and (display-mode: fullscreen) {
  #app-splash {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    transition: opacity 0.25s ease;
    /* Safety net: never stay on screen longer than 12 seconds */
    animation: app-splash-out 0.25s ease 12s forwards;
  }
  #app-splash.app-splash-done {
    opacity: 0;
    pointer-events: none;
  }
  #app-splash.app-splash-gone {
    display: none;
  }
  .app-splash-dots {
    display: flex;
    gap: 10px;
  }
  .app-splash-dots i {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4f46e5;
    animation: app-splash-bounce 1.1s ease-in-out infinite;
  }
  .app-splash-dots i:nth-child(2) { animation-delay: 0.15s; }
  .app-splash-dots i:nth-child(3) { animation-delay: 0.3s; }
}
@keyframes app-splash-bounce {
  0%, 80%, 100% { transform: scale(0.55); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
@keyframes app-splash-out {
  to { opacity: 0; visibility: hidden; }
}
@media all and (display-mode: standalone), all and (display-mode: fullscreen) {
  html.dark #app-splash { background: #0b1020; }
  html.dark .app-splash-dots i { background: #818cf8; }
}
@media (prefers-reduced-motion: reduce) {
  .app-splash-dots i { animation-duration: 2.4s; }
}`;
