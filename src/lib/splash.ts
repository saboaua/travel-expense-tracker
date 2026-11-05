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
