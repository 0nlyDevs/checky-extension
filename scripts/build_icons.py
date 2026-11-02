"""Render the Checky mark at browser icon sizes. Run with: uv run --with pillow python scripts/build_icons.py."""

from pathlib import Path

from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (512, 512))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, 511, 511), radius=96, fill="#0a0a0b")
draw.ellipse((104, 104, 232, 232), fill="#f3f2ee")
for box in ((272, 136, 416, 176), (96, 280, 416, 320), (96, 360, 312, 400)):
    draw.rounded_rectangle(box, radius=8, fill="#f3f2ee")
for size in (16, 32, 48, 128):
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / f"{size}.png")
