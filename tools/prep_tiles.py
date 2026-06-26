"""Prepare seamless floor tiles: downscale to 128px (NEAREST, keeps the
chunky pixel-art crisp). No keying or cropping — tiles are opaque and
full-frame. Writes to /assets.

Usage:  python tools/prep_tiles.py <raw_dir> <out_dir>
"""
import sys, os, glob
from PIL import Image

if __name__ == "__main__":
    raw_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for p in sorted(glob.glob(os.path.join(raw_dir, "*.png"))):
        name = os.path.splitext(os.path.basename(p))[0]
        im = Image.open(p).convert("RGB").resize((128, 128), Image.NEAREST)
        im.save(os.path.join(out_dir, name + ".png"))
        print("tiled", name)
