const STEP = [0.7, 0.15, 0.7];
const STEP_4D = [0.7, 0.15, 0.7, 0.7];
const GOAL = { goal: true };

export const LEVELS = [
  {
    title: 'Straight ahead',
    layout: {
      n: 3,
      start: [0, 0, 0],
      floor: { center: [0, -0.25, 3], half: [3, 0.25, 5] },
      platforms: [{ center: [0, 0.6, 4], half: [0.8, 0.15, 0.8], ...GOAL }],
    },
    guide: [
      'This is 3D practice. The picture shows what your camera sees from behind your white body.',
      'The gold platform is straight ahead. Walk forward with W and jump with Space to land on it.',
    ],
  },
  {
    title: 'Off to the side',
    layout: {
      n: 3,
      start: [0, 0, 0],
      floor: { center: [0, -0.25, 3], half: [5, 0.25, 5] },
      platforms: [{ center: [3.5, 0.6, 3], half: [0.8, 0.15, 0.8], ...GOAL }],
    },
    guide: [
      'Straight ahead is the vertical line through your body in the picture.',
      'Turn with ← → until the gold platform sits on that line, then walk forward and jump.',
    ],
  },
  {
    title: 'Steps',
    layout: {
      n: 3,
      start: [0, 0, 0],
      floor: { center: [0, -0.25, 4], half: [4, 0.25, 6] },
      platforms: [
        { center: [0, 0.5, 2.5], half: STEP },
        { center: [1.5, 1.2, 4.5], half: STEP },
        { center: [0, 1.9, 6.5], half: STEP, ...GOAL },
      ],
    },
    guide: [
      'Climb the steps to the gold one. Before each jump, turn until the next step sits on the line through your body.',
      'Falling only drops you back onto the floor.',
    ],
  },
  {
    title: 'Into the fourth dimension',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 3, 0], half: [3, 0.25, 5, 3] },
      platforms: [{ center: [0, 0.6, 4, 0], half: [0.8, 0.15, 0.8, 0.8], ...GOAL }],
    },
    guide: [
      'The world now has four dimensions, and the picture is a 3D box. Its directions are right, up and ana, the new fourth direction. How far ahead something is shows as size.',
      'The gold platform is straight ahead, so it sits on the vertical line through your body. Walk forward with W and watch it grow, then jump onto it.',
    ],
  },
  {
    title: 'Sideways',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 3, 0], half: [4, 0.25, 5, 3] },
      platforms: [{ center: [2.5, 0.6, 3.5, 0], half: [0.8, 0.15, 0.8, 0.8], ...GOAL }],
    },
    guide: [
      'The goal is to your right. D and A slide you sideways, which slides the scene left and right in the box.',
      'Look at the shadows on the box floor. Slide until your shadow sits inside the goal’s shadow, then walk forward and jump.',
    ],
  },
  {
    title: 'The ana direction',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 3, 0], half: [3, 0.25, 5, 4] },
      platforms: [{ center: [0, 0.6, 3.5, 2.5], half: [0.8, 0.15, 0.8, 0.8], ...GOAL }],
    },
    guide: [
      'The goal is off in the fourth direction. E and Q slide you toward ana and kata, which slides the scene front to back inside the box.',
      'Slide until your shadow sits inside the goal’s shadow, then walk forward and jump.',
    ],
  },
  {
    title: 'Turntable',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 3, 0], half: [5, 0.25, 5, 5] },
      platforms: [{ center: [2.5, 0.6, 3.5, 2.5], half: [0.8, 0.15, 0.8, 0.8], ...GOAL }],
    },
    guide: [
      'Z and X spin the box like a turntable: nothing grows or shrinks, things only swing around your body.',
      'Spin until the goal’s shadow sits straight to the left or right of yours, with no front or back offset. Then turn toward it with ← →, or slide with A D, and jump.',
    ],
  },
  {
    title: 'Turning into ana',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 2, 1], half: [4, 0.25, 5, 5] },
      platforms: [{ center: [0, 0.6, 2, 3.5], half: [0.8, 0.15, 0.8, 0.8], ...GOAL }],
    },
    guide: [
      '↑ and ↓ turn you toward ana and kata. Things sweep through the box front to back while growing or shrinking.',
      'Turn until the goal’s shadow sits on yours, then walk forward and jump.',
    ],
  },
  {
    title: 'Steps in four dimensions',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 3, 1.5], half: [4, 0.25, 5, 4] },
      platforms: [
        { center: [0, 0.5, 2.5, 0], half: STEP_4D },
        { center: [0, 1.2, 3.5, 2], half: STEP_4D },
        { center: [1.8, 1.9, 4.5, 2.6], half: STEP_4D, ...GOAL },
      ],
    },
    guide: [
      'Three steps, each in a different direction. Before every jump, line the next step’s shadow up with yours.',
      'Use whichever moves feel easiest. Any way that lines the shadows up works.',
    ],
  },
  {
    title: 'The climb',
    layout: {
      n: 4,
      start: [0, 0, 0, 0],
      floor: { center: [0, -0.25, 4, 1], half: [5, 0.25, 6, 5] },
      platforms: [
        { center: [0, 0.5, 2.5, 0], half: STEP_4D },
        { center: [1.6, 0.95, 3.8, 1], half: STEP_4D },
        { center: [1.2, 1.4, 5.4, 2.3], half: STEP_4D },
        { center: [-0.6, 1.85, 6.2, 3.4], half: STEP_4D },
        { center: [-2.2, 2.3, 5.4, 2.4], half: STEP_4D },
        { center: [-2.8, 2.75, 3.6, 1.4], half: STEP_4D },
        { center: [-1.6, 3.2, 2.2, 0.2], half: STEP_4D, ...GOAL },
        { center: [2.5, 1.2, 1.5, -2.5], half: STEP_4D },
        { center: [-3, 0.8, 1, -2], half: STEP_4D },
        { center: [3, 2, 6, -2], half: STEP_4D },
        { center: [0, 2.6, 8, -1], half: STEP_4D },
      ],
    },
    guide: [
      'A winding climb through four dimensions, with a few platforms that lead nowhere. The gold one is at the top.',
      'Take it one step at a time: find the next step up, line up its shadow with yours, jump.',
    ],
  },
];

const FREE_PLAY_4D = {
  n: 4,
  start: [0, 0, -3.5, 0],
  floor: { center: [0, -0.25, 2, 0], half: [7, 0.25, 7, 7] },
  platforms: [
    { center: [-2, 0.6, 1, -2], half: [0.8, 0.15, 0.8, 0.8] },
    { center: [2, 1.0, 2, 1], half: [0.7, 0.15, 0.9, 0.7] },
    { center: [0, 1.6, 4, 0], half: [1.0, 0.15, 0.6, 1.0] },
    { center: [-3, 2.2, 5, 3], half: [0.8, 0.15, 0.8, 0.6] },
    { center: [3, 2.6, 6, -3], half: [0.6, 0.15, 0.6, 0.9] },
    { center: [0, 3.0, 7, 4], half: [0.9, 0.15, 0.7, 0.7] },
    { center: [-1, 0.9, 3, 4], half: [0.6, 0.15, 0.6, 0.6] },
    { center: [1, 1.9, 1, -4], half: [0.7, 0.15, 0.7, 0.7] },
    { center: [4, 0.5, 4, 2], half: [0.8, 0.15, 0.8, 0.8] },
    { center: [-4, 1.3, 7, -1], half: [0.7, 0.15, 0.9, 0.7] },
  ],
};

function dropFourthAxis(layout) {
  const keep = v => v.slice(0, 3);
  const keepBox = b => ({ ...b, center: keep(b.center), half: keep(b.half) });
  return { n: 3, start: keep(layout.start), floor: keepBox(layout.floor), platforms: layout.platforms.map(keepBox) };
}

export const FREE_PLAY = { 4: FREE_PLAY_4D, 3: dropFourthAxis(FREE_PLAY_4D) };
