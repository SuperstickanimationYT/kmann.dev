"""Shrink real global maps into the small colour and height textures Find Home ships.

Usage: python tools/build-planet-maps.py <folder with the raw downloads>

Raw downloads (all NASA, public domain):
  lroc_color_2k.jpg   NASA SVS CGI Moon Kit, LRO LROC WAC colour
  ldem_4_uint.tif     NASA SVS CGI Moon Kit, LRO LOLA elevation, uint16 half-metres
  mar0kuu2.jpg        JPL Solar System Simulator, Viking colour mosaic
  megt90n000cb.img    PDS Geosciences Node, MGS MOLA MEGDR 4 px/deg, int16 metres, big-endian
  world.200407.3x5400x2700.jpg     NASA Earth Observatory, Blue Marble Next Generation, July 2004
  gebco_08_rev_elev_5400x2700.jpg  NASA Earth Observatory from GEBCO, land elevation 0-6400 m
  gebco_08_rev_bath_5400x2700.jpg  NASA Earth Observatory from GEBCO, 255 on land, lower over water
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

WIDTH = 1024
HEIGHT = 512
COLOUR_QUALITY = 82
EARTH_HIGHEST_M = 6400
DRY_LAND = 255
SEA_ICE_FLOOR = 50
COAST_UNMIX_FLOOR = 0.35
COAST_FILL_STEPS = 6
NEIGHBOUR_SHIFTS = [(1, 0), (-1, 0), (1, 1), (-1, 1)]
OUT = Path(__file__).resolve().parent.parent / 'data' / 'planets'


def centred_on_prime_meridian(heights, starts_at_zero_east):
    return np.roll(heights, heights.shape[1] // 2, axis=1) if starts_at_zero_east else heights


def save_colour(source, name, land=None):
    colour = Image.open(source).convert('RGB').resize((WIDTH, HEIGHT), Image.LANCZOS)
    if land is not None:
        ocean = ocean_colour(colour, land)
        print(f'{name} open-ocean colour: {ocean.round().astype(int).tolist()}')
        colour = land_colour_everywhere(colour, land, ocean)
        colour.putalpha(land)
    colour.save(OUT / f'{name}-colour.webp', quality=COLOUR_QUALITY, method=6, exact=True)


def ocean_colour(colour, land):
    pixels = np.asarray(colour)
    water = np.asarray(land) == 0
    open_water = water & (pixels.min(axis=2) <= SEA_ICE_FLOOR)
    return np.median(pixels[open_water], axis=0)


def land_colour_everywhere(colour, land, ocean):
    pixels = np.asarray(colour).astype(np.float64)
    share = np.asarray(land).astype(np.float64)[..., None] / 255
    known = share[..., 0] >= COAST_UNMIX_FLOOR
    unmixed = (pixels - (1 - share) * ocean) / np.maximum(share, 1e-6)
    filled = np.where(known[..., None], np.clip(unmixed, 0, 255), 0)
    weight = known.astype(np.float64)
    for _ in range(COAST_FILL_STEPS):
        neighbours = sum(np.roll(filled * weight[..., None], shift, axis) for shift, axis in NEIGHBOUR_SHIFTS)
        count = sum(np.roll(weight, shift, axis) for shift, axis in NEIGHBOUR_SHIFTS)
        grow = (weight == 0) & (count > 0)
        filled[grow] = neighbours[grow] / count[grow, None]
        weight[grow] = 1
    filled[weight == 0] = ocean
    return Image.fromarray(np.round(filled).astype(np.uint8), 'RGB')


def grey(path):
    return np.asarray(Image.open(path).convert('L'), dtype=np.float64)


def land_mask(bathymetry_path):
    dry = Image.fromarray((grey(bathymetry_path) >= DRY_LAND).astype(np.float32) * 255, 'F')
    return Image.fromarray(np.round(np.asarray(dry.resize((WIDTH, HEIGHT), Image.BOX))).astype(np.uint8), 'L')


def area_weighted_mean(metres):
    latitudes = (0.5 - (np.arange(metres.shape[0]) + 0.5) / metres.shape[0]) * np.pi
    weights = np.cos(latitudes)[:, None] * np.ones_like(metres)
    return float((metres * weights).sum() / weights.sum())


def save_height(metres, name, datum_metres=0.0):
    low, high = float(metres.min()), float(metres.max())
    scaled = np.round((metres - low) / (high - low) * 255).astype(np.uint8)
    Image.fromarray(scaled, 'L').resize((WIDTH, HEIGHT), Image.LANCZOS).save(OUT / f'{name}-height.webp', lossless=True, method=6)
    return {'lowKm': round(low / 1000, 3), 'highKm': round(high / 1000, 3), 'datumKm': round(datum_metres / 1000, 3)}


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
    ranges['Moon'] = save_height(moon, 'moon', datum_metres=area_weighted_mean(moon))

    mola = np.fromfile(raw / 'megt90n000cb.img', dtype='>i2').reshape(720, 1440).astype(np.float64)
    mola = centred_on_prime_meridian(mola, starts_at_zero_east=True)
    turn, as_is, turned = best_half_turn(raw / 'mar0kuu2.jpg', mola)
    print(f'Mars colour vs MOLA edge correlation: as is {as_is:.3f}, half turn {turned:.3f}')
    if turn:
        raise SystemExit('Viking colour map is offset half a turn from MOLA; fix its centring before shipping.')
    save_colour(raw / 'mar0kuu2.jpg', 'mars')
    ranges['Mars'] = save_height(mola, 'mars')

    save_colour(raw / 'world.200407.3x5400x2700.jpg', 'earth', land=land_mask(raw / 'gebco_08_rev_bath_5400x2700.jpg'))
    ranges['Earth'] = save_height(grey(raw / 'gebco_08_rev_elev_5400x2700.jpg') / 255 * EARTH_HIGHEST_M, 'earth')

    (OUT / 'maps.json').write_text(json.dumps(ranges, indent=2) + '\n')
    for path in sorted(OUT.iterdir()):
        print(f'{path.name}: {path.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
