"""Shrink real global maps into the small colour and height textures Find Home ships.

Usage: python tools/build-planet-maps.py <folder with the raw downloads>

Raw downloads (all NASA, public domain):
  lroc_color_2k.jpg   NASA SVS CGI Moon Kit, LRO LROC WAC colour
  ldem_4_uint.tif     NASA SVS CGI Moon Kit, LRO LOLA elevation, uint16 half-metres
  mar0kuu2.jpg        JPL Solar System Simulator, Viking colour mosaic
  megt90n000cb.img    PDS Geosciences Node, MGS MOLA MEGDR 4 px/deg, int16 metres, big-endian
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

WIDTH = 1024
HEIGHT = 512
COLOUR_QUALITY = 82
OUT = Path(__file__).resolve().parent.parent / 'data' / 'planets'


def centred_on_prime_meridian(heights, starts_at_zero_east):
    return np.roll(heights, heights.shape[1] // 2, axis=1) if starts_at_zero_east else heights


def save_colour(source, name):
    Image.open(source).convert('RGB').resize((WIDTH, HEIGHT), Image.LANCZOS).save(OUT / f'{name}-colour.webp', quality=COLOUR_QUALITY, method=6)


def save_height(metres, name):
    low, high = float(metres.min()), float(metres.max())
    scaled = np.round((metres - low) / (high - low) * 255).astype(np.uint8)
    Image.fromarray(scaled, 'L').resize((WIDTH, HEIGHT), Image.LANCZOS).save(OUT / f'{name}-height.webp', lossless=True, method=6)
    return {'lowKm': round(low / 1000, 3), 'highKm': round(high / 1000, 3)}


def edge_strength(grey):
    return np.abs(np.diff(grey, axis=1, append=grey[:, :1])) + np.abs(np.diff(grey, axis=0, append=grey[:1, :]))


def best_half_turn(colour_path, heights):
    grey = np.asarray(Image.open(colour_path).convert('L').resize(heights.shape[::-1], Image.LANCZOS), dtype=np.float64)
    edges = edge_strength(grey)
    relief = edge_strength(heights.astype(np.float64))
    score = lambda shifted: np.corrcoef(edges.ravel(), shifted.ravel())[0, 1]
    as_is = score(relief)
    turned = score(np.roll(relief, relief.shape[1] // 2, axis=1))
    return turned > as_is, as_is, turned


def main(raw):
    OUT.mkdir(parents=True, exist_ok=True)
    ranges = {}

    moon = np.asarray(Image.open(raw / 'ldem_4_uint.tif'), dtype=np.float64) * 0.5
    save_colour(raw / 'lroc_color_2k.jpg', 'moon')
    ranges['Moon'] = save_height(moon, 'moon')

    mola = np.fromfile(raw / 'megt90n000cb.img', dtype='>i2').reshape(720, 1440).astype(np.float64)
    mola = centred_on_prime_meridian(mola, starts_at_zero_east=True)
    turn, as_is, turned = best_half_turn(raw / 'mar0kuu2.jpg', mola)
    print(f'Mars colour vs MOLA edge correlation: as is {as_is:.3f}, half turn {turned:.3f}')
    if turn:
        raise SystemExit('Viking colour map is offset half a turn from MOLA; fix its centring before shipping.')
    save_colour(raw / 'mar0kuu2.jpg', 'mars')
    ranges['Mars'] = save_height(mola, 'mars')

    (OUT / 'maps.json').write_text(json.dumps(ranges, indent=2) + '\n')
    for path in sorted(OUT.iterdir()):
        print(f'{path.name}: {path.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
