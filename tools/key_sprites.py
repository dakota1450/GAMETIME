"""Key out the solid magenta/green background from generated sprites,
feather the edges, despill, autocrop, and downscale to 256px (NEAREST,
to keep the chunky pixel-art crisp). Writes transparent PNGs to /assets.

Usage:  python tools/key_sprites.py <raw_dir> <out_dir>
Sprites listed in GREEN_KEYED were generated on a green key; the rest magenta.
"""
import sys, os, glob
from PIL import Image

GREEN_KEYED = {"enemy_repo_enforcer", "enemy_sec_construct"}

def key_color(name):
    return (0, 255, 0) if name in GREEN_KEYED else (255, 0, 255)

def despill(r, g, b, kc):
    # pull edge pixels away from the key hue so no pink/green fringe remains
    if kc[0] == 255 and kc[2] == 255:           # magenta key -> clamp R,B toward G
        r = min(r, g + 28); b = min(b, g + 28)
    elif kc[1] == 255:                          # green key -> clamp G toward avg(R,B)
        g = min(g, (r + b) // 2 + 28)
    return r, g, b

def process(path, out_dir):
    name = os.path.splitext(os.path.basename(path))[0]
    kc = key_color(name)
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    NEAR, FEATHER = 100.0, 175.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dr, dg, db = r - kc[0], g - kc[1], b - kc[2]
            dist = (dr * dr + dg * dg + db * db) ** 0.5
            if dist < NEAR:
                px[x, y] = (r, g, b, 0)
            elif dist < FEATHER:
                aa = int(255 * (dist - NEAR) / (FEATHER - NEAR))
                r, g, b = despill(r, g, b, kc)
                px[x, y] = (r, g, b, aa)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    m = max(w, h)
    if m > 256:
        s = 256.0 / m
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.NEAREST)
    os.makedirs(out_dir, exist_ok=True)
    im.save(os.path.join(out_dir, name + ".png"))
    return name, im.size

if __name__ == "__main__":
    raw_dir, out_dir = sys.argv[1], sys.argv[2]
    for p in sorted(glob.glob(os.path.join(raw_dir, "*.png"))):
        n, sz = process(p, out_dir)
        print("keyed", n, sz)
