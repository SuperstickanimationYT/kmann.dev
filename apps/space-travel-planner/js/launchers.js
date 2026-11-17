export const LAUNCH_SITE_LATITUDE = 28.5;
export const PARKING_ORBIT_ALTITUDE_KM = 185;

export const LAUNCHER_SOURCE =
  'NASA Launch Services Program, Launch Vehicle Performance Website (elvperf.ksc.nasa.gov), High Energy query, retrieved 2026-11-16. Separated spacecraft mass, valid for launch declinations between -28.5 and 28.5 degrees.';

export const LAUNCHERS = {
  falcon9Rtls: {
    name: 'Falcon 9 (booster lands at the Cape)',
    curve: [[0, 1770], [2.5, 1550], [5, 1330], [7.5, 1105], [10, 875]],
  },
  falcon9Asds: {
    name: 'Falcon 9 (booster lands on a drone ship)',
    curve: [[0, 3310], [2.5, 3025], [5, 2745], [7.5, 2480], [10, 2220]],
  },
  falconHeavyRecovery: {
    name: 'Falcon Heavy (boosters recovered)',
    curve: [[0, 6690], [2.5, 6275], [5, 5855], [7.5, 5495], [10, 5130], [12.5, 4800], [15, 4465], [20, 3845], [25, 3270], [30, 2740], [35, 2255], [40, 1805], [50, 1005], [60, 320]],
  },
  falconHeavyExpendable: {
    name: 'Falcon Heavy (fully expended)',
    curve: [[0, 15010], [2.5, 14310], [5, 13615], [7.5, 12980], [10, 12345], [12.5, 11765], [15, 11190], [20, 10115], [25, 9130], [30, 8225], [35, 7400], [40, 6640], [50, 5280], [60, 4100], [70, 3080], [80, 2195], [90, 1425], [100, 755]],
  },
  vulcanVc0: {
    name: 'Vulcan VC0',
    curve: [[0, 2100], [2.5, 1905], [5, 1710]],
  },
  vulcanVc2: {
    name: 'Vulcan VC2',
    curve: [[0, 5920], [2.5, 5625], [5, 5330], [7.5, 5040], [10, 4750], [12.5, 4480], [15, 4210], [20, 3710], [25, 3230], [30, 2790], [35, 2370], [40, 1970], [50, 1260], [60, 630]],
  },
  vulcanVc4: {
    name: 'Vulcan VC4',
    curve: [[0, 8550], [2.5, 8185], [5, 7820], [7.5, 7480], [10, 7140], [12.5, 6815], [15, 6490], [20, 5880], [25, 5320], [30, 4780], [35, 4270], [40, 3800], [50, 2940], [60, 2170], [70, 1420], [80, 830], [90, 310]],
  },
  vulcanVc6: {
    name: 'Vulcan VC6',
    curve: [[0, 10850], [2.5, 10405], [5, 9960], [7.5, 9545], [10, 9130], [12.5, 8735], [15, 8340], [20, 7630], [25, 6950], [30, 6310], [35, 5710], [40, 5150], [50, 4120], [60, 3250], [70, 2420], [80, 1780], [90, 1370], [100, 770]],
  },
  newGlenn: {
    name: 'New Glenn',
    curve: [[0, 7180], [2.5, 6880], [5, 6360], [7.5, 5645], [10, 4930], [12.5, 4270], [15, 3605], [20, 2365], [25, 1205], [30, 120]],
  },
};

export function highestC3(launcher) {
  return launcher.curve.at(-1)[0];
}

export function payloadAt(launcher, c3) {
  const { curve } = launcher;
  if (c3 <= curve[0][0]) return curve[0][1];
  if (c3 > highestC3(launcher)) return 0;
  const upper = curve.findIndex(([pointC3]) => pointC3 >= c3);
  const [c3Low, massLow] = curve[upper - 1];
  const [c3High, massHigh] = curve[upper];
  return massLow + ((massHigh - massLow) * (c3 - c3Low)) / (c3High - c3Low);
}

export function bestC3For(launcher, massKg) {
  const { curve } = launcher;
  if (massKg > curve[0][1]) return null;
  if (massKg <= curve.at(-1)[1]) return highestC3(launcher);
  const upper = curve.findIndex(([, mass]) => mass < massKg);
  const [c3Low, massLow] = curve[upper - 1];
  const [c3High, massHigh] = curve[upper];
  return c3Low + ((c3High - c3Low) * (massLow - massKg)) / (massLow - massHigh);
}
