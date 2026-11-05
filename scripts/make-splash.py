"""Makes the iPhone/iPad launch images in public/splash (plain white: the animated loader takes over as soon as the page arrives).
Run: python3 scripts/make-splash.py   (needs Pillow). """
from PIL import Image
import os

# (css width, css height, pixel ratio)
DEVICES = [
    (440, 956, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3),
    (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2), (320, 568, 2),
    (1024, 1366, 2), (834, 1194, 2), (820, 1180, 2), (834, 1112, 2), (768, 1024, 2),
]
out = os.path.join(os.path.dirname(__file__), "..", "public", "splash")
for w, h, r in DEVICES:
    W, H = w * r, h * r
    img = Image.new("L", (W, H), 255)
    img.save(os.path.join(out, f"launch-{W}x{H}.png"), optimize=True)
    print(f"launch-{W}x{H}.png")
