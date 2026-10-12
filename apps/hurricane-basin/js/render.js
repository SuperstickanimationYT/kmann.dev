import { COASTS } from './geography.js';
import { columnOf, DOMAIN, NX, NY, rowOf } from './grid.js';
import { CATEGORIES } from './storms.js';

const HAZE = { from: 0.95, to: 1.05, thickness: 0.12 };
const DOWNPOUR = { from: 1, to: 1.1 };
const CLOUD_TOPS = { calm: 0.5, windyAt: 35 };
const ISOBAR_HPA = 4;
const GRATICULE_DEGREES = 10;
const STORM_FUEL_FROM = 26.5;

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function ramp(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    const [at, colour] = stops[k];
    if (x <= at) {
      const [before, previous] = stops[k - 1];
      const t = (x - before) / (at - before);
      return previous.map((channel, index) => mix(channel, colour[index], t));
    }
  }
  return stops.at(-1)[1];
}

const WIND_STOPS = [[0, [12, 30, 60]], [10, [25, 80, 140]], [17.5, [40, 190, 220]], [33, [240, 235, 120]], [50, [255, 150, 50]], [70, [240, 50, 70]], [85, [200, 60, 220]]];
const PRESSURE_STOPS = [[930, [120, 40, 160]], [980, [40, 90, 200]], [1004, [60, 150, 210]], [1012, [200, 220, 225]], [1020, [230, 150, 90]], [1028, [200, 70, 50]]];
const OCEAN_STOPS = [[14, [40, 70, 160]], [20, [60, 140, 200]], [24, [120, 200, 190]], [26.5, [240, 220, 120]], [28, [250, 150, 60]], [30, [220, 60, 50]]];

function landColour(lat) {
  const dry = clamp01((Math.abs(lat - 24) < 8 ? 1 - Math.abs(lat - 24) / 8 : 0) * 0.8);
  return [mix(52, 120, dry), mix(78, 100, dry), mix(48, 62, dry)];
}

export function createRenderer(canvas, model) {
  const context = canvas.getContext('2d');
  const field = Object.assign(document.createElement('canvas'), { width: NX, height: NY });
  const fieldContext = field.getContext('2d');
  const image = fieldContext.createImageData(NX, NY);
  let box = { x: 0, y: 0, width: 1, height: 1, ratio: 1 };

  function resize(clearAbove = 0) {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const top = height - clearAbove >= (width / NX) * NY ? clearAbove : 0;
    const scale = Math.min(width / NX, (height - top) / NY);
    box = { x: (width - NX * scale) / 2, y: top + (height - top - NY * scale) / 2, width: NX * scale, height: NY * scale, ratio };
  }

  const toScreen = (column, row) => [box.x + ((column + 0.5) / NX) * box.width, box.y + (1 - (row + 0.5) / NY) * box.height];
  const toGrid = (x, y) => [((x - box.x) / box.width) * NX - 0.5, (1 - (y - box.y) / box.height) * NY - 0.5];

  function pixel(cell, j, layer) {
    const { land, q, speed, seaTemperature } = model;
    if (layer === 'wind') return land[cell] ? ramp(WIND_STOPS, speed[cell]).map((c) => c * 0.55 + 20) : ramp(WIND_STOPS, speed[cell]);
    if (layer === 'pressure') return ramp(PRESSURE_STOPS, model.pressureAt(cell)).map((c) => (land[cell] ? c * 0.6 : c));
    if (layer === 'ocean') return land[cell] ? landColour(DOMAIN.south + ((j + 0.5) / NY) * (DOMAIN.north - DOMAIN.south)) : ramp(OCEAN_STOPS, seaTemperature[cell] + model.warming);
    const lat = DOMAIN.south + ((j + 0.5) / NY) * (DOMAIN.north - DOMAIN.south);
    const ground = land[cell] ? landColour(lat) : [8, 30, 62];
    const haze = clamp01((q[cell] - HAZE.from) / (HAZE.to - HAZE.from)) * HAZE.thickness;
    const towering = CLOUD_TOPS.calm + (1 - CLOUD_TOPS.calm) * clamp01(speed[cell] / CLOUD_TOPS.windyAt);
    const cloud = Math.max(haze, towering * clamp01((q[cell] - DOWNPOUR.from) / (DOWNPOUR.to - DOWNPOUR.from)));
    return ground.map((channel, index) => mix(channel, [236, 242, 250][index], cloud));
  }

  function paintField(layer) {
    const { data } = image;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cell = j * NX + i;
        const [r, g, b] = pixel(cell, j, layer);
        const at = ((NY - 1 - j) * NX + i) * 4;
        data[at] = r;
        data[at + 1] = g;
        data[at + 2] = b;
        data[at + 3] = 255;
      }
    }
    if (layer === 'pressure') markIsobars(data);
    if (layer === 'ocean') markFuelLine(data);
    fieldContext.putImageData(image, 0, 0);
  }

  function markIsobars(data) {
    for (let j = 0; j < NY - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const cell = j * NX + i;
        const band = Math.floor(model.pressureAt(cell) / ISOBAR_HPA);
        if (band !== Math.floor(model.pressureAt(cell + 1) / ISOBAR_HPA) || band !== Math.floor(model.pressureAt(cell + NX) / ISOBAR_HPA)) darken(data, i, j);
      }
    }
  }

  function markFuelLine(data) {
    const warm = (cell) => !model.land[cell] && model.seaTemperature[cell] + model.warming >= STORM_FUEL_FROM;
    for (let j = 0; j < NY - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const cell = j * NX + i;
        if (model.land[cell] || model.land[cell + 1] || model.land[cell + NX]) continue;
        if (warm(cell) !== warm(cell + 1) || warm(cell) !== warm(cell + NX)) lighten(data, i, j);
      }
    }
  }

  function darken(data, i, j) {
    const at = ((NY - 1 - j) * NX + i) * 4;
    for (let k = 0; k < 3; k++) data[at + k] *= 0.45;
  }

  function lighten(data, i, j) {
    const at = ((NY - 1 - j) * NX + i) * 4;
    for (let k = 0; k < 3; k++) data[at + k] = 255;
  }

  function lonLatToScreen(lon, lat) {
    return toScreen(columnOf(lon), rowOf(lat));
  }

  function drawGeography() {
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();
    context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.font = '11px Trebuchet MS, Segoe UI, sans-serif';
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let lat = Math.ceil(DOMAIN.south / GRATICULE_DEGREES) * GRATICULE_DEGREES; lat < DOMAIN.north; lat += GRATICULE_DEGREES) {
      const [, y] = lonLatToScreen(DOMAIN.west, lat);
      context.beginPath();
      context.moveTo(box.x, y);
      context.lineTo(box.x + box.width, y);
      context.stroke();
      context.fillText(`${lat}°N`, box.x + 4, y - 3);
    }
    for (let lon = Math.ceil(DOMAIN.west / GRATICULE_DEGREES) * GRATICULE_DEGREES; lon < DOMAIN.east; lon += GRATICULE_DEGREES) {
      const [x] = lonLatToScreen(lon, DOMAIN.south);
      context.beginPath();
      context.moveTo(x, box.y);
      context.lineTo(x, box.y + box.height);
      context.stroke();
      context.fillText(`${-lon}°W`, x + 3, box.y + box.height - 4);
    }
    context.strokeStyle = 'rgba(230, 240, 255, 0.55)';
    context.lineWidth = 1.2;
    for (const coast of COASTS) {
      context.beginPath();
      coast.forEach(([lon, lat], index) => context[index ? 'lineTo' : 'moveTo'](...lonLatToScreen(lon, lat)));
      context.closePath();
      context.stroke();
    }
    context.restore();
  }

  function drawTrack(storm) {
    const fade = storm.active ? 1 : 0.45;
    context.lineWidth = 2;
    for (let k = 1; k < storm.track.length; k++) {
      const [a, b] = [storm.track[k - 1], storm.track[k]];
      if (Math.abs(a.i - b.i) > NX / 2) continue;
      context.strokeStyle = CATEGORIES.findLast((category) => b.wind >= category.from).colour;
      context.globalAlpha = fade * 0.85;
      context.beginPath();
      context.moveTo(...toScreen(a.i, a.j));
      context.lineTo(...toScreen(b.i, b.j));
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawStorm(storm, isSelected, time) {
    const [x, y] = toScreen(storm.i, storm.j);
    const size = 7 + Math.min(6, storm.wind / 12);
    context.save();
    context.translate(x, y);
    context.rotate(time * -2);
    context.strokeStyle = storm.category.colour;
    context.fillStyle = storm.category.colour;
    context.lineWidth = 2.5;
    for (const turn of [0, Math.PI]) {
      context.beginPath();
      context.arc(Math.cos(turn) * size * 0.5, Math.sin(turn) * size * 0.5, size, turn + Math.PI, turn + Math.PI * 1.6);
      context.stroke();
    }
    context.beginPath();
    context.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (isSelected) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, size + 7, 0, Math.PI * 2);
      context.stroke();
    }
    const label = storm.name ? `${storm.name} · ${storm.category.short}` : storm.category.short;
    context.font = '700 12px Trebuchet MS, Segoe UI, sans-serif';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(3, 8, 15, 0.85)';
    context.fillStyle = '#ffffff';
    context.strokeText(label, x + size + 6, y + 4);
    context.fillText(label, x + size + 6, y + 4);
  }

  function draw({ layer, storms, showing, showTracks, selected, time }) {
    paintField(layer);
    context.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.drawImage(field, box.x, box.y, box.width, box.height);
    drawGeography();
    if (showTracks) storms.forEach(drawTrack);
    for (const storm of showing) drawStorm(storm, storm === selected, time);
  }

  return { resize, draw, toGrid, toScreen };
}
