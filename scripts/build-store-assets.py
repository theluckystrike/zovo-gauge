#!/usr/bin/env python3
"""Build deterministic CWS artwork from the real light/dark popup captures."""

from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

if len(sys.argv) != 4:
    raise SystemExit("usage: build-store-assets.py <light-popup.png> <dark-popup.png> <out-dir>")

light_path, dark_path, out_path = map(Path, sys.argv[1:])
out_path.mkdir(parents=True, exist_ok=True)

def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()

def rounded_paste(canvas, source, box, radius=22):
    source = source.convert("RGB").resize((box[2], box[3]), Image.Resampling.LANCZOS)
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *source.size), radius=radius, fill=255)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sx, sy = box[0] + 12, box[1] + 18
    ImageDraw.Draw(shadow).rounded_rectangle((sx, sy, sx + box[2], sy + box[3]), radius=radius, fill=(4, 41, 45, 80))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
    canvas.paste(source, (box[0], box[1]), mask)

def screenshot(source_path, filename, dark=False):
    ground = (7, 25, 28, 255) if dark else (239, 248, 246, 255)
    ink = (237, 255, 252) if dark else (14, 52, 56)
    muted = (159, 190, 189) if dark else (82, 111, 113)
    accent = (45, 212, 191) if dark else (15, 118, 110)
    feature_surface = (14, 54, 57) if dark else (222, 243, 239)
    canvas = Image.new("RGBA", (1280, 800), ground)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((860, -280, 1420, 280), fill=(*accent, 20))
    draw.text((80, 76), "PRE-WATCH SIGNAL", font=font(18, True), fill=accent)
    draw.text((80, 118), "Choose with a", font=font(58, True), fill=ink)
    draw.text((80, 180), "clearer gauge.", font=font(58, True), fill=accent)
    body = "Visible likes ÷ views becomes a calm engagement chip.\nSet your floor, then browse without the low-signal noise."
    draw.multiline_text((84, 276), body, font=font(24), fill=muted, spacing=10)
    features = [
        ("5.0%", "Honest likes-per-view score"),
        ("50/day", "Visible momentum estimate"),
        ("SESSION", "Private local ranking"),
    ]
    y = 390
    for value, label in features:
        draw.rounded_rectangle((80, y, 650, y + 82), radius=16, outline=accent, width=2, fill=feature_surface)
        draw.text((104, y + 17), value, font=font(24, True), fill=accent)
        draw.text((246, y + 23), label, font=font(20), fill=ink)
        y += 96
    rounded_paste(canvas, Image.open(source_path), (790, 64, 400, 620))
    draw.rounded_rectangle((822, 712, 1158, 760), radius=24, fill=accent)
    draw.text((872, 724), "DOM-only · local-first", font=font(18, True), fill=(255, 255, 255))
    canvas.convert("RGB").save(out_path / filename, quality=94)

screenshot(light_path, "screenshot-01-engagement.png", False)
screenshot(dark_path, "screenshot-02-private.png", True)

icon_path = Path(__file__).resolve().parents[1] / "Extensions" / "Combined" / "icons" / "gauge128.png"
icon = Image.open(icon_path).convert("RGBA")
flat = Image.new("RGB", (128, 128), (239, 248, 246))
flat.paste(icon, mask=icon.getchannel("A"))
flat.save(out_path / "store-icon-128.png")

promo = Image.new("RGB", (440, 280), (7, 25, 28))
draw = ImageDraw.Draw(promo)
draw.ellipse((250, -120, 520, 150), fill=(13, 71, 71))
promo_icon = flat.resize((96, 96), Image.Resampling.LANCZOS)
promo.paste(promo_icon, (44, 44))
draw.text((44, 160), "Gauge", font=font(42, True), fill=(237, 255, 252))
draw.text((44, 214), "Engagement before commitment", font=font(18), fill=(159, 190, 189))
promo.save(out_path / "promo-small-440x280.png")
