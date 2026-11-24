"""Simulate weather on Earth-like planets and save the cloud maps Sail the Stars reuses on made-up worlds.

Usage: python tools/simulate-cloud-maps.py [--only MAP]   (needs numpy, scipy and Pillow; about ten minutes)

  1. A two-layer quasi-geostrophic model on the sphere, like Marshall & Molteni 1993, spins up jets, lows,
     highs and fronts from a warm equator and cold poles.
  2. Air is traced back through the last days of wind. Air that has been rising is cloudy, air that has been
     sinking is clear, and noise carried along the paths is drawn out into filaments.
     Tropical storms and convection are added by hand, because the model cannot make them.
"""

import argparse
from concurrent.futures import ProcessPoolExecutor
from os import environ
from pathlib import Path

environ.setdefault('OPENBLAS_NUM_THREADS', '1')

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

MAPS = 10
WORKERS = 5
OUT = Path(__file__).resolve().parent.parent / 'data' / 'clouds'
COVER_SIZE = (2048, 1024)
TOPS_SIZE = (512, 256)
COVER_QUALITY = 40
TOPS_QUALITY = 50

TRUNCATION = 85
MODEL_LATITUDES = 128
MODEL_LONGITUDES = 256
STEPS_PER_DAY = 208
SPIN_UP_DAYS = 50
TRACED_DAYS = 4
WINDS_PER_DAY = 16
ROTATION = 2 * np.pi
LAYER_COUPLING = 50.0
JET_SHEAR = 0.52
STORM_TRACK_SWING = 0.3
JET_LATITUDE = 43
JET_HALF_WIDTH = 17
COOLING_DAYS = 10
DRAG_DAYS = 2
SMALLEST_EDDY_DAYS = 0.06

TRACED_LAYERS = (0.35, 0.8)
RISE_MEMORY_DAYS = 1.3
TRADE_WIND = 0.07
TROPICAL_EDDY_WIND = 0.085
STORM_WIND = 0.42
STORM_INFLOW = 0.06


def legendre(nodes):
    orders = TRUNCATION + 1
    table = np.zeros((orders, orders + 1, nodes.size))
    sines = np.sqrt(1 - nodes ** 2)
    sectoral = np.full(nodes.size, np.sqrt(0.5))
    for m in range(orders):
        if m:
            sectoral = -np.sqrt((2 * m + 1) / (2 * m)) * sines * sectoral
        table[m, 0] = sectoral
        table[m, 1] = np.sqrt(2 * m + 3) * nodes * sectoral
        for n in range(m + 2, m + orders + 1):
            a = np.sqrt((4 * n * n - 1) / (n * n - m * m))
            b = np.sqrt(((n - 1) ** 2 - m * m) / (4 * (n - 1) ** 2 - 1))
            table[m, n - m] = a * (nodes * table[m, n - m - 1] - b * table[m, n - m - 2])
    return table


def by_order(rows, basis):
    """Multiply each order's column of complex rows by its own real matrix, all fields at once."""
    fields = np.moveaxis(rows.reshape(-1, *rows.shape[-2:]), -1, 0)
    halves = np.concatenate([fields.real, fields.imag], axis=1)
    product = np.matmul(halves, basis)
    whole = product[:, :len(fields[0])] + 1j * product[:, len(fields[0]):]
    return np.moveaxis(whole, 0, 1).reshape(*rows.shape[:-2], rows.shape[-1], basis.shape[-1])


class Sphere:
    def __init__(self):
        self.mu, self.weights = np.polynomial.legendre.leggauss(MODEL_LATITUDES)
        full = legendre(self.mu)
        orders = TRUNCATION + 1
        m = np.arange(orders)[:, None]
        n = m + np.arange(orders)[None, :]
        self.m = m
        self.valid = n <= TRUNCATION
        self.laplacian = np.where(self.valid, -n * (n + 1.0), 0)
        self.values = full[:, :orders] * self.valid[..., None]
        self.values_by_latitude = self.values.swapaxes(-1, -2).copy()
        below = np.zeros_like(self.values)
        below[:, 1:] = full[:, :orders - 1]
        epsilon = lambda k: np.sqrt(np.maximum(k * k - m * m, 0) / (4.0 * k * k - 1))
        slopes = ((n + 1) * epsilon(n))[..., None] * below - (n * epsilon(n + 1))[..., None] * full[:, 1:orders + 1]
        self.slopes = slopes * self.valid[..., None] / (1 - self.mu ** 2)

    def forward(self, grid):
        rows = np.fft.rfft(grid, axis=-1)[..., :TRUNCATION + 1] / MODEL_LONGITUDES
        return by_order(rows * self.weights[:, None], self.values_by_latitude)

    def inverse(self, basis, spectrum):
        rows = by_order(spectrum.swapaxes(-1, -2), basis)
        rows = rows.swapaxes(-1, -2)
        padded = np.zeros(rows.shape[:-1] + (MODEL_LONGITUDES // 2 + 1,), complex)
        padded[..., :TRUNCATION + 1] = rows
        return np.fft.irfft(padded, MODEL_LONGITUDES, axis=-1) * MODEL_LONGITUDES

    def grid(self, spectrum):
        return self.inverse(self.values, spectrum)

    def east_slope(self, spectrum):
        return self.inverse(self.values, 1j * self.m * spectrum)

    def north_slope(self, spectrum):
        return self.inverse(self.slopes, spectrum)

    def jacobian(self, a, b):
        return self.east_slope(a) * self.north_slope(b) - self.north_slope(a) * self.east_slope(b)


def resting_thermal_wind(sphere, rng):
    latitude = np.degrees(np.arcsin(sphere.mu))
    centre = JET_LATITUDE + rng.uniform(-3, 3)
    shear = rng.uniform(0.92, 1.1) * JET_SHEAR * np.exp(-((np.abs(latitude) - centre) / JET_HALF_WIDTH) ** 2)
    stream = -np.concatenate([[0], np.cumsum(0.5 * (shear[1:] + shear[:-1]) * np.diff(np.arcsin(sphere.mu)))])
    longitude = np.arange(MODEL_LONGITUDES) / MODEL_LONGITUDES * 2 * np.pi
    waves = [[rng.uniform(0, 1) * np.cos(k * longitude + rng.uniform(0, 2 * np.pi)) / k ** 0.5 for k in (1, 2, 3)] for _ in range(2)]
    swing = [sum(hemisphere) / 1.5 for hemisphere in waves]
    northern = 0.5 + 0.5 * np.tanh(sphere.mu[:, None] / 0.3)
    tracks = 1 + STORM_TRACK_SWING * (northern * swing[0] + (1 - northern) * swing[1])
    spectrum = sphere.forward(stream[:, None] * tracks)
    spectrum[0, 0] = 0
    return spectrum


def spun_up_weather(seed):
    rng = np.random.default_rng(seed)
    sphere = Sphere()
    planetary = sphere.forward(np.repeat(2 * ROTATION * sphere.mu[:, None], MODEL_LONGITUDES, 1))
    rest = resting_thermal_wind(sphere, rng)
    barotropic = np.where(sphere.laplacian < 0, sphere.laplacian, -1)
    baroclinic = sphere.laplacian - 2 * LAYER_COUPLING
    step = 1 / STEPS_PER_DAY
    damping = (-sphere.laplacian / (TRUNCATION * (TRUNCATION + 1))) ** 4 / SMALLEST_EDDY_DAYS
    keep = np.exp(-damping * step) * sphere.valid

    def streams(vorticity):
        relative = vorticity - planetary
        mean = (relative[0] + relative[1]) / barotropic
        difference = (relative[0] - relative[1]) / baroclinic
        mean[0, 0] = 0
        return np.stack([(mean + difference) / 2, (mean - difference) / 2])

    ripples = gaussian_filter(rng.standard_normal((MODEL_LATITUDES, MODEL_LONGITUDES)), 4, mode='wrap')
    psi = np.stack([0.8 * rest, 0.05 * rest]) + 0.02 * sphere.forward(ripples)
    stretching = LAYER_COUPLING * (psi[0] - psi[1])
    vorticity = sphere.laplacian * psi + planetary + np.stack([-stretching, stretching])
    tendencies = []
    history = []
    steps = (SPIN_UP_DAYS + TRACED_DAYS) * STEPS_PER_DAY
    for index in range(steps + 1):
        psi = streams(vorticity)
        if index >= SPIN_UP_DAYS * STEPS_PER_DAY and index % (STEPS_PER_DAY // WINDS_PER_DAY) == 0:
            history.append(psi)
        warming = LAYER_COUPLING * (psi[0] - psi[1] - rest) / COOLING_DAYS
        tendency = -sphere.forward(sphere.jacobian(psi, vorticity))
        tendency[0] += warming
        tendency[1] -= warming + sphere.laplacian * psi[1] / DRAG_DAYS
        tendencies = [tendency, *tendencies[:2]]
        change = tendency if len(tendencies) < 3 else (23 * tendencies[0] - 16 * tendencies[1] + 5 * tendencies[2]) / 12
        vorticity = planetary + (vorticity + step * change - planetary) * keep
    return sphere, history, rest


def rising_air(sphere, history, rest):
    hemisphere = np.tanh(sphere.mu[:, None] / 0.25)
    fields = []
    for index, psi in enumerate(history):
        first, last = max(index - 1, 0), min(index + 1, len(history) - 1)
        shear = lambda layers: layers[0] - layers[1]
        change = sphere.grid(shear(history[last]) - shear(history[first])) * WINDS_PER_DAY / (last - first)
        carried = sphere.jacobian(0.5 * (psi[0] + psi[1]), shear(psi))
        heated = -sphere.grid(shear(psi) - rest) / COOLING_DAYS
        fields.append(hemisphere * (change + carried - heated))
    return fields


def padded(field):
    return np.pad(np.pad(field, ((1, 1), (0, 0)), mode='edge'), ((0, 0), (2, 2)), mode='wrap').astype(np.float32)


def tropical_eddies(sphere, rng):
    scattered = lambda: rng.standard_normal((MODEL_LATITUDES, MODEL_LONGITUDES))
    smoothed = lambda rows, columns: gaussian_filter(scattered(), (rows, columns), mode=('nearest', 'wrap')) * np.sqrt(rows * columns)
    stirring = smoothed(5.5, 9) + 0.25 * smoothed(2.5, 4)
    spectrum = sphere.forward(stirring * np.exp(-(np.degrees(np.arcsin(sphere.mu)) / 26) ** 4)[:, None])
    return spectrum * TROPICAL_EDDY_WIND / sphere.north_slope(spectrum)[MODEL_LATITUDES * 3 // 8:MODEL_LATITUDES * 5 // 8].std()


def wind_frames(sphere, history, rest, rng):
    eddies = tropical_eddies(sphere, rng)
    cosines = np.sqrt(1 - sphere.mu[:, None] ** 2)
    frames = []
    for psi, rise in zip(history, rising_air(sphere, history, rest)):
        streams = [upper * psi[0] + (1 - upper) * psi[1] + eddies for upper in TRACED_LAYERS]
        winds = [(padded(-cosines * sphere.north_slope(stream)), padded(sphere.east_slope(stream) / cosines)) for stream in streams]
        frames.append((winds, padded(rise)))
    return frames


def to_vector(longitude, latitude):
    return np.stack([np.cos(latitude) * np.cos(longitude), np.cos(latitude) * np.sin(longitude), np.sin(latitude)], -1)


def place_storms(rng):
    storms = []
    for _ in range(rng.integers(1, 4)):
        hemisphere = rng.choice([-1, 1])
        centre = to_vector(rng.uniform(-np.pi, np.pi), hemisphere * np.radians(rng.uniform(9, 24)))
        storms.append((centre, hemisphere, rng.uniform(0.035, 0.065), rng.uniform(0.5, 1.0)))
    return storms


def storm_winds(place, storms):
    wind = np.zeros_like(place)
    for centre, hemisphere, radius, strength in storms:
        off = place - centre
        distance = np.maximum(np.sqrt((off ** 2).sum(-1)), 1e-6)
        swirl = strength * np.minimum(distance / radius, 1) * np.exp(-np.maximum(distance - radius, 0) / (1.6 * radius)) / distance
        wind += (hemisphere * STORM_WIND * swirl)[..., None] * np.cross(centre, off) - (STORM_INFLOW * swirl)[..., None] * off
    return wind


def traced_back(sphere, frames, storms, layer, size):
    width, height = size
    longitude, latitude = np.meshgrid((np.arange(width) + 0.5) / width * 2 * np.pi - np.pi, (0.5 - (np.arange(height) + 0.5) / height) * np.pi)
    place = to_vector(longitude, latitude)
    latitudes = np.arcsin(sphere.mu)
    step = 1 / WINDS_PER_DAY
    risen = np.zeros((height, width))
    path = [place.astype(np.float32)]
    for back, (winds, rise) in enumerate(reversed(frames[1:])):
        latitude = np.arcsin(np.clip(place[..., 2], -1, 1))
        longitude = np.arctan2(place[..., 1], place[..., 0])
        rows = np.interp(latitude, latitudes, np.arange(MODEL_LATITUDES)) + 1
        columns = (longitude % (2 * np.pi)) / (2 * np.pi) * MODEL_LONGITUDES + 2
        at_place = lambda field: map_coordinates(field, [rows, columns], order=1, mode='nearest')
        risen += at_place(rise) * np.exp(-back * step / RISE_MEMORY_DAYS) * step
        trades = TRADE_WIND * np.exp(-(latitude / np.radians(22)) ** 4)
        eastward = np.stack([-np.sin(longitude), np.cos(longitude), np.zeros_like(longitude)], -1)
        northward = np.cross(place, eastward)
        wind = (at_place(winds[layer][0]) - trades)[..., None] * eastward + at_place(winds[layer][1])[..., None] * northward
        place = place - step * (wind + storm_winds(place, storms))
        place /= np.linalg.norm(place, axis=-1, keepdims=True)
        path.append(place.astype(np.float32))
    return risen, path


def hashed(x, y, z):
    key = x * np.uint32(73856093) ^ y * np.uint32(19349663) ^ z * np.uint32(83492791)
    key = (key ^ (key >> np.uint32(15))) * np.uint32(2654435761)
    return ((key >> np.uint32(13)) ^ key) & np.uint32(0xFFFF)


def axes_of(points):
    return [points[..., axis].astype(np.float32) for axis in range(3)]


def noise(points, rng, octaves=1, gain=0.5):
    table = rng.random(1 << 16).astype(np.float32)
    axes = axes_of(points)
    total = np.zeros(points.shape[:-1], np.float32)
    for octave in range(octaves):
        places = [axis * np.float32(2 ** octave) + np.float32(17.3 * octave) for axis in axes]
        floors = [np.floor(place) for place in places]
        cells = [floor.astype(np.int32).astype(np.uint32) for floor in floors]
        x, y, z = [t * t * t * (t * (t * 6 - 15) + 10) for t in (place - floor for place, floor in zip(places, floors))]
        corner = lambda i, j, k: table[hashed(cells[0] + np.uint32(i), cells[1] + np.uint32(j), cells[2] + np.uint32(k))]
        along_x = lambda j, k: (lambda low, high: low + (high - low) * x)(corner(0, j, k), corner(1, j, k))
        along_y = lambda k: (lambda low, high: low + (high - low) * y)(along_x(0, k), along_x(1, k))
        near, far = along_y(0), along_y(1)
        total += np.float32(gain ** octave) * (near + (far - near) * z - np.float32(0.5))
    return total / np.float32(sum(gain ** octave for octave in range(octaves)))


def distance_to_cells(points, rng):
    table = rng.random((1 << 16, 3)).astype(np.float32)
    axes = axes_of(points)
    cells = [np.floor(axis).astype(np.int32) for axis in axes]
    nearest = np.full(points.shape[:-1], 9, np.float32)
    for shift in np.ndindex(3, 3, 3):
        neighbours = [cell + step - 1 for cell, step in zip(cells, shift)]
        offsets = table[hashed(*(neighbour.astype(np.uint32) for neighbour in neighbours))]
        away = sum((neighbour.astype(np.float32) + offsets[..., k] - axes[k]) ** 2 for k, neighbour in enumerate(neighbours))
        np.minimum(nearest, away, out=nearest)
    return np.sqrt(nearest)


def smoothstep(low, high, x):
    t = np.clip((x - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def standardised(field, latitude, where):
    weights = np.cos(latitude) * where
    mean = (field * weights).sum() / weights.sum()
    return (field - mean) / np.sqrt((((field - mean) ** 2) * weights).sum() / weights.sum())


def storm_clouds(storms, here, path, rng):
    covered = np.zeros(here.shape[:-1])
    cleared = np.zeros(here.shape[:-1])
    ragged = 0.35 * noise(here * 14, rng, 3) + 0.3 * noise(path[WINDS_PER_DAY // 8] * 40, rng, 4, 0.65)
    bands = noise(path[WINDS_PER_DAY // 4] * 22, rng, 5, 0.65)
    for centre, _, radius, strength in storms:
        distance = np.sqrt(((here - centre) ** 2).sum(-1)) / radius
        eye = smoothstep(0.07, 0.13, distance) if strength > 0.8 else 1
        shield = smoothstep(1.8, 0.4, distance + 3 * ragged + 2 * bands) * eye
        arms = 0.85 * smoothstep(4.2, 1.2, distance) * smoothstep(0.02, 0.20, bands + 0.5 * ragged)
        covered = np.maximum(covered, np.maximum(shield, arms))
        cleared = np.maximum(cleared, 0.35 * smoothstep(5, 2.2, distance))
    return covered, cleared


def composed(rng, storms, size, risen_low, low, risen_high, high):
    width, height = size
    latitude = np.repeat(((0.5 - (np.arange(height) + 0.5) / height) * np.pi)[:, None], width, 1)
    here = low[0]
    day = WINDS_PER_DAY
    from_latitude = np.degrees(np.arcsin(np.clip(low[day * 5 // 4][..., 2], -1, 1)))
    degrees = 0.35 * np.degrees(latitude) + 0.65 * from_latitude + 9 * noise(here * 3, rng, 4, 0.6)
    poleward = np.abs(degrees)
    poleward_here = np.abs(np.degrees(latitude))
    storm_belt = smoothstep(18, 36, poleward_here)
    midlatitude = (storm_belt > 0.5) * (poleward_here < 68)
    fronts = np.tanh(0.8 * standardised(risen_low, latitude, midlatitude)) * storm_belt
    lifted = np.tanh(0.8 * standardised(risen_high, latitude, midlatitude)) * storm_belt

    fine = noise(here * 60, rng, 5, 0.65)
    carried = noise(low[day // 4] * 38, rng, 5, 0.65)
    smeared = noise(low[day] * 14, rng, 6, 0.65)
    streaks = noise(high[day * 3 // 2] * 9, rng, 7, 0.68)
    broad = noise(low[day // 2] * 5, rng, 4, 0.6)

    moisture = (
        0.10 * np.exp(-((degrees - 6) / 8) ** 2)
        - 0.13 * np.exp(-((poleward - 23) / 9) ** 2)
        + 0.17 * np.exp(-((poleward - 58) / 18) ** 2)
        + 0.10 * smoothstep(60, 80, poleward)
    )
    sheet = 0.50 + moisture + 0.27 * fronts + 0.75 * smeared + 0.45 * carried + 0.3 * fine + 0.75 * broad
    layered = smoothstep(0.38, 0.82, sheet)

    tropics = np.exp(-((degrees - 4) / 18) ** 4)
    wide = np.array([1, 1, 1.6], np.float32)
    clusters = 1.25 * noise(low[day // 2] * 3.2 * wide, rng, 4, 0.62) + 0.5 * noise(low[day // 4] * 17, rng, 4, 0.65)
    belt = 0.10 * np.exp(-((degrees - 6) / 6) ** 2) + 0.05 * np.exp(-((degrees + 9) / 8) ** 2) - 0.02
    convection = tropics * smoothstep(0.14, 0.40, clusters + belt + 0.6 * noise(low[day // 8] * 55, rng, 4, 0.7))
    anvils = tropics * smoothstep(0.08, 0.5, clusters + belt + 0.5 * noise(high[day // 2] * 20, rng, 5, 0.68))

    wobble = np.stack([noise(here * 130, rng, 2) for _ in range(3)], -1)
    cells = distance_to_cells(low[day // 8] * 95 + 0.5 * wobble, rng)
    patches = smoothstep(-0.16, 0.22, noise(here * 22, rng, 4, 0.65))
    cold_air = storm_belt * smoothstep(0.1, 0.8, -fronts) * smoothstep(82, 66, poleward_here)
    decks = np.exp(-((poleward_here - 22) / 12) ** 2) * smoothstep(0.02, 0.24, noise(low[day // 2] * 2.3 * wide, rng, 4, 0.55))
    low_cloud = patches * np.maximum(0.85 * cold_air * smoothstep(0.35, 0.75, cells), decks * (0.95 - 0.6 * smoothstep(0.3, 0.8, cells)))
    scattered = smoothstep(-0.12, 0.2, noise(here * 4, rng, 3) + 0.5 * smeared)
    fair_weather = 0.8 * scattered * smoothstep(0.10, 0.32, noise(low[day // 8] * 75, rng, 5, 0.75) + 0.2 * carried)
    cirrus = smoothstep(0.0, 0.36, streaks + 0.08 * lifted - 0.03 + 0.2 * moisture)
    storm, cleared = storm_clouds(storms, here, low, rng)

    clear = 1.0
    quiet = 1 - cleared
    for cover in (layered, quiet * convection, quiet * 0.6 * anvils, quiet * low_cloud, quiet * fair_weather, 0.6 * cirrus, storm):
        clear = clear * (1 - np.clip(cover, 0, 1))
    tops = np.maximum.reduce([
        0.95 * convection, 0.75 * anvils, 0.95 * storm, layered * np.clip(0.4 + 0.4 * lifted, 0.12, 0.85),
        0.55 * cirrus, 0.15 * low_cloud, 0.12 * fair_weather,
    ])
    return 1 - clear, tops


def cloud_map(seed, weather=None, size=COVER_SIZE):
    rng = np.random.default_rng(1000 + seed)
    sphere, history, rest = weather or spun_up_weather(seed)
    frames = wind_frames(sphere, history, rest, rng)
    storms = place_storms(rng)
    layers = [traced_back(sphere, frames, storms, layer, size) for layer in range(len(TRACED_LAYERS))]
    return composed(rng, storms, size, *layers[0], *layers[1])


def grey(field):
    return Image.fromarray(np.round(np.clip(field, 0, 1) * 255).astype(np.uint8), 'L')


def build(index):
    cover, tops = cloud_map(index)
    OUT.mkdir(parents=True, exist_ok=True)
    grey(cover).save(OUT / f'cover-{index}.webp', quality=COVER_QUALITY, method=6)
    grey(tops).resize(TOPS_SIZE, Image.BOX).save(OUT / f'tops-{index}.webp', quality=TOPS_QUALITY, method=6)
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', type=int)
    chosen = parser.parse_args().only
    with ProcessPoolExecutor(WORKERS) as pool:
        for index in pool.map(build, range(MAPS) if chosen is None else [chosen]):
            print(f'cloud map {index} done', flush=True)
