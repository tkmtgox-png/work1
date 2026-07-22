import struct
import zlib
import math


def make_png(path, size, bg, fg):
    pixels = bytearray()
    cx, cy = size / 2, size * 0.42
    r = size * 0.22
    tip_y = size * 0.78
    for y in range(size):
        row = bytearray()
        for x in range(size):
            dx, dy = x - cx, y - cy
            in_circle = dx * dx + dy * dy <= r * r
            in_tip = False
            if not in_circle and cy <= y <= tip_y:
                half_w = r * (1 - (y - cy) / (tip_y - cy))
                if abs(dx) <= half_w:
                    in_tip = True
            color = fg if (in_circle or in_tip) else bg
            row += bytes(color)
        pixels.append(0)
        pixels += row
    raw = bytes(pixels)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


bg = (37, 99, 235, 255)
fg = (255, 255, 255, 255)
make_png("icon-192.png", 192, bg, fg)
make_png("icon-512.png", 512, bg, fg)
print("done")
