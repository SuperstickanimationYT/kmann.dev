"""Turn Natural Earth's river lines into the small course file Sail the Stars ships.

Usage: python tools/build-earth-rivers.py <ne_50m_rivers_lake_centerlines.geojson>

Raw download: Natural Earth 1:50m rivers and lake centerlines (public domain),
github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_rivers_lake_centerlines.geojson

Lines are cut where they meet, turned to run towards the sea, and given levels from the
game's own height map and widths that grow with the length of river upstream.

data/planets/earth-rivers.bin, little-endian: per course a uint16 point count, then per point
int16 longitude and latitude (32767 = 180 and 90 degrees), int16 level and uint16 width in metres.
"""

import heapq
import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

PLANETS = Path(__file__).parent.parent / 'data' / 'planets'
OUTPUT = PLANETS / 'earth-rivers.bin'
EARTH_KM = 6371
SNAP_DEGREES = 0.02
BRIDGE_DEGREES = 0.12
SIMPLIFY_DEGREES = 0.03
LEAST_UPSTREAM_KM = 60
WIDTH_AT_300_KM = 150
WIDTH_POWER = 0.6
WIDEST_METRES = 3000


def kilometres(a, b):
    lat = math.radians((a[1] + b[1]) / 2)
    return math.radians(math.hypot((a[0] - b[0]) * math.cos(lat), a[1] - b[1])) * EARTH_KM


def read_lines(path):
    lines = []
    for feature in json.loads(Path(path).read_text(encoding='utf8'))['features']:
        geometry = feature['geometry']
        for line in [geometry['coordinates']] if geometry['type'] == 'LineString' else geometry['coordinates']:
            lines.append([tuple(point[:2]) for point in line])
    return lines


class Nodes:
    def __init__(self):
        self.cells = defaultdict(list)
        self.places = []

    def of(self, point):
        x, y = (math.floor(value / SNAP_DEGREES) for value in point)
        for cell in ((x + i, y + j) for i in (-1, 0, 1) for j in (-1, 0, 1)):
            for node in self.cells[cell]:
                if math.dist(self.places[node], point) < SNAP_DEGREES:
                    return node
        self.places.append(point)
        self.cells[x, y].append(len(self.places) - 1)
        return len(self.places) - 1


def height_reader():
    image = Image.open(PLANETS / 'earth-height.webp').convert('RGB').getchannel(0)
    land = Image.open(PLANETS / 'earth-colour.webp').convert('RGBA').getchannel(3)
    earth = json.loads((PLANETS / 'maps.json').read_text())['Earth']
    low, span = earth['lowKm'] - earth.get('datumKm', 0), earth['highKm'] - earth['lowKm']

    def sample(channel, point):
        width, height = channel.size
        fx = (point[0] / 360 + 0.5) * width - 0.5
        fy = min(height - 1, max(0, (0.5 - point[1] / 180) * height - 0.5))
        x, y = math.floor(fx), math.floor(fy)
        at = lambda i, j: channel.getpixel((i % width, min(height - 1, j)))
        top = at(x, y) + (at(x + 1, y) - at(x, y)) * (fx - x)
        bottom = at(x, y + 1) + (at(x + 1, y + 1) - at(x, y + 1)) * (fx - x)
        return (top + (bottom - top) * (fy - y)) / 255

    return (lambda point: max(0, (low + sample(image, point) * span) * 1000)), (lambda point: min(sample(land, (point[0] + east, point[1] + north)) for east in (-0.4, 0, 0.4) for north in (-0.4, 0, 0.4)))


def components(neighbours):
    left = set(neighbours)
    while left:
        stack, found = [left.pop()], []
        while stack:
            node = stack.pop()
            found.append(node)
            for other, _ in neighbours[node]:
                if other in left:
                    left.discard(other)
                    stack.append(other)
        yield found


def simplified(points, junctions):
    for k in range(1, len(points) - 1):
        if points[k] in junctions:
            return simplified(points[:k + 1], junctions)[:-1] + simplified(points[k:], junctions)
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    length = math.hypot(bx - ax, by - ay) or 1e-9
    off = [abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length for x, y in points]
    worst = max(range(len(points)), key=off.__getitem__)
    if off[worst] < SIMPLIFY_DEGREES:
        return [points[0], points[-1]]
    return simplified(points[:worst + 1], junctions)[:-1] + simplified(points[worst:], junctions)


def main(path):
    nodes = Nodes()
    neighbours = defaultdict(list)
    ends = []

    def join(a, b):
        if a != b and all(other != b for other, _ in neighbours[a]):
            length = kilometres(nodes.places[a], nodes.places[b])
            neighbours[a].append((b, length))
            neighbours[b].append((a, length))

    for line in read_lines(path):
        chain = [nodes.of(point) for point in line]
        for a, b in zip(chain, chain[1:]):
            join(a, b)
        ends += [chain[0], chain[-1]]
    group = {}
    for number, found in enumerate(components(neighbours)):
        for node in found:
            group[node] = number
    for end in ends:
        if len(neighbours[end]) != 1:
            continue
        near = [(math.dist(nodes.places[end], place), node) for node, place in enumerate(nodes.places) if group.get(node) != group[end] and abs(place[0] - nodes.places[end][0]) < BRIDGE_DEGREES]
        if near and min(near)[0] < BRIDGE_DEGREES:
            join(end, min(near)[1])

    height, land = height_reader()
    courses = []
    for found in components(neighbours):
        tips = [node for node in found if len(neighbours[node]) == 1] or found
        mouths = [node for node in tips if land(nodes.places[node]) < 0.97 and height(nodes.places[node]) < 200]
        mouths = mouths or [min(tips, key=lambda node: height(nodes.places[node]))]
        downstream, queue, order = {}, [(0, mouth, None) for mouth in mouths], []
        heapq.heapify(queue)
        while queue:
            distance, node, toward = heapq.heappop(queue)
            if node in downstream:
                continue
            downstream[node] = toward
            order.append(node)
            for other, length in neighbours[node]:
                if other not in downstream:
                    heapq.heappush(queue, (distance + length, other, node))
        upstream_km = defaultdict(float)
        feeders = defaultdict(list)
        for node in reversed(order):
            if downstream[node] is not None:
                upstream_km[downstream[node]] += upstream_km[node] + kilometres(nodes.places[node], nodes.places[downstream[node]])
                feeders[downstream[node]].append(node)
        level = {}
        for node in reversed(order):
            level[node] = min([height(nodes.places[node])] + [level[feeder] for feeder in feeders[node]])
        for mouth in mouths:
            if land(nodes.places[mouth]) < 0.97:
                level[mouth] = 0
        main_feeder = {node: max(above, key=lambda feeder: upstream_km[feeder]) for node, above in feeders.items() if above}
        for head in order:
            if feeders[head]:
                continue
            chain = [head]
            while downstream[chain[-1]] is not None:
                below = downstream[chain[-1]]
                ends_here = main_feeder[below] != chain[-1]
                chain.append(below)
                if ends_here:
                    break
            courses.append([(nodes.places[node], level[node], LEAST_UPSTREAM_KM + upstream_km[node]) for node in chain])

    junctions = {course[-1][0] for course in courses}
    packed = bytearray()
    points = 0
    for course in courses:
        if len(course) < 2:
            continue
        kept = set(simplified([place for place, _, _ in course], junctions))
        course = [entry for entry in course if entry[0] in kept]
        packed += struct.pack('<H', len(course))
        points += len(course)
        for (lon, lat), metres, upstream in course:
            width = min(WIDEST_METRES, WIDTH_AT_300_KM * (upstream / 300) ** WIDTH_POWER)
            packed += struct.pack('<hhhH', round(lon / 180 * 32767), round(lat / 90 * 32767), round(metres), round(width))
    OUTPUT.write_bytes(packed)
    print(len(courses), 'courses,', points, 'points,', len(packed), 'bytes')


main(sys.argv[1])
