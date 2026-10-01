"""Dependency-free PNG icon generator for EV Multi-Tracker.

Writes true RGBA PNGs using only zlib from the standard library. Shapes are
rasterised with 4x4 supersampling for clean antialiased edges.
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # supersampling factor per axis

TOP = (59, 130, 246)     # #3b82f6
BOTTOM = (30, 64, 175)  # #1e40af
BOLT = (255, 255, 255)

# Lightning bolt in a 0..1 box (y grows downward).
BOLT_PTS = [
    (0.600, 0.040),
    (0.260, 0.550),
    (0.455, 0.550),
    (0.375, 0.960),
    (0.740, 0.450),
    (0.545, 0.450),
]


def lerp(a, b, t):
    return a + (b - a) * t


def in_poly(x, y, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    return inside


def in_rounded(x, y, r):
    if r <= 0.0:
        return True
    cx = min(max(x, r), 1.0 - r)
    cy = min(max(y, r), 1.0 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def render(size, maskable):
    """Return raw RGBA bytes for one icon.

    maskable icons use a full-bleed square background and shrink the glyph so
    it survives the circular 80% safe zone that launchers may crop to.
    """
    r = 0.0 if maskable else 0.2237
    scale = 0.70 if maskable else 1.0
    # Re-centre the glyph inside the safe zone.
    offset = (1.0 - scale) / 2.0
    pts = [(x * scale + offset, y * scale + offset) for x, y in BOLT_PTS]

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            bg_hits = 0
            bolt_hits = 0
            for sy in range(SS):
                y = (py + (sy + 0.5) / SS) / size
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    if not in_rounded(x, y, r):
                        continue
                    bg_hits += 1
                    if in_poly(x, y, pts):
                        bolt_hits += 1
            total = SS * SS
            if bg_hits == 0:
                row += bytes((0, 0, 0, 0))
                continue
            # Vertical gradient, then composite the bolt over it.
            t = (py + 0.5) / size
            base = tuple(int(round(lerp(TOP[i], BOTTOM[i], t))) for i in range(3))
            a = bg_hits / total
            b = bolt_hits / total
            if b > 0.0:
                mix = b / a if a else 0.0
                col = tuple(int(round(lerp(base[i], BOLT[i], mix))) for i in range(3))
            else:
                col = base
            row += bytes((col[0], col[1], col[2], int(round(a * 255))))
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + r for r in rows)
    return raw


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, maskable):
    raw = render(size, maskable)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)
    print("wrote %s (%d bytes, %dx%d)" % (os.path.basename(path), len(png), size, size))


if __name__ == "__main__":
    for s in (192, 512):
        write_png(os.path.join(OUT, "icon-%d.png" % s), s, False)
        write_png(os.path.join(OUT, "icon-%d-maskable.png" % s), s, True)
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180, True)
