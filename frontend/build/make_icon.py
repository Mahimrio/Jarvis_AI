# one-shot: renders the ember particle-orb app icon (build/icon.ico)
import math
import random

from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
cx = cy = SIZE / 2
R = SIZE * 0.42

# soft ember glow behind the orb
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 80, 10, 60))
glow = glow.filter(ImageFilter.GaussianBlur(SIZE * 0.06))
img.alpha_composite(glow)

# near-black orb body so dots pop at small sizes
draw.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(12, 8, 6, 255))

# fibonacci-sphere dot shell, front hemisphere only — matches the HUD orb
random.seed(7)
N = 900
ga = math.pi * (3 - math.sqrt(5))
for i in range(N):
    y = 1 - (i / (N - 1)) * 2
    r = math.sqrt(max(0.0, 1 - y * y))
    th = ga * i
    x, z = math.cos(th) * r, math.sin(th) * r
    if z < -0.15:
        continue  # hide most of the back face
    px, py = cx + x * R, cy + y * R
    depth = (z + 1) / 2  # 0 back → 1 front
    s = 1.2 + depth * 2.6
    a = int(70 + depth * 185)
    warm = int(70 + depth * 110)
    draw.ellipse([px - s, py - s, px + s, py + s], fill=(255, warm, 20, a))

# bright molten core
core = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
cd = ImageDraw.Draw(core)
cr = R * 0.34
cd.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(255, 120, 30, 220))
core = core.filter(ImageFilter.GaussianBlur(SIZE * 0.04))
img.alpha_composite(core)
hot = R * 0.15
draw = ImageDraw.Draw(img)
draw.ellipse([cx - hot, cy - hot, cx + hot, cy + hot], fill=(255, 214, 150, 255))

img.save("build/icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.resize((256, 256), Image.LANCZOS).save("build/icon.png")
print("icon written")
