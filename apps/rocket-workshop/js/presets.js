import { addBeam, addMotor, addNode, emptyDesign, mountCpu, toggleEngine, toggleRange, toggleSeparator, toggleTank } from './design.js';

const HOPPER_PROGRAM = `# Hop: climb for 5 seconds, coast up and fall back, then land
# softly. range1 looks down from the engine, so it measures
# the height of the nozzle above the ground.

keep thrust = 60000         # newtons, the engine's full thrust
keep nozzleHeight = 1       # range1 reading while standing on the pad
keep phase = 1

height = range1.distance - nozzleHeight

if phase == 1 then          # climb
  engine1.throttle = 1
  if time > 5 then phase = 2 end
elseif phase == 2 then      # fall, then brake just in time
  brake = thrust / mass - 9.8
  target = -sqrt(0.8 * brake * max(height, 0)) - 1   # fall no faster than braking at 40% can stop
  if vspeed > 0 then
    engine1.throttle = 0
  else
    engine1.throttle = clamp(mass * (9.8 + 4 * (target - vspeed)) / thrust, 0, 1)
  end
  if height < 0.2 then phase = 3 end
else                        # landed
  engine1.throttle = 0
end
`;

const TWO_STAGE_PROGRAM = `# Burn the first stage until its tank is empty, drop it,
# then light the second stage. The upper tank holds 1600 kg,
# so fuel falls to 1600 when the lower tank runs dry.
# Each engine swings on a motor. Steering the thrust sideways
# keeps the rocket upright, the way real rockets gimbal.

keep stage = 1
keep lean = 1               # gimbal degrees per degree of lean
keep damp = 0.3             # gimbal degrees per degree per second of spin

gimbal = clamp(lean * pitch + damp * spin, -8, 8)

if stage == 1 then
  engine1.throttle = 1
  motor1.power = clamp((gimbal - motor1.angle) * 0.3, -1, 1)
  if fuel <= 1600 then
    engine1.throttle = 0
    sep1.fire = 1
    stage = 2
  end
else
  engine2.throttle = 1
  motor2.power = clamp((gimbal - motor2.angle) * 0.3, -1, 1)
end
`;

const GIMBAL_MOTOR = { mode: 'spin', power: 0, stallTorque: 3000, freeRpm: 10 };

function place(design, points) {
  return Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [name, addNode(design, x, y)]));
}

function link(design, pairs, layer = 0) {
  return pairs.map(([p, q]) => addBeam(design, p.id, q.id, layer));
}

function bottomStageLegs(design, n) {
  link(design, [[n.footL, n.base1], [n.footR, n.base1], [n.footL, n.top1], [n.footR, n.top1], [n.nozzle1, n.footL], [n.nozzle1, n.footR]]);
}

function hopper() {
  const design = emptyDesign();
  design.layers = ['Rocket'];
  const n = place(design, { footL: [-2, 0], footR: [2, 0], nozzle1: [0, 1], base1: [0, 2], top1: [0, 8] });
  const [engineBeam, tank] = link(design, [[n.nozzle1, n.base1], [n.base1, n.top1]]);
  bottomStageLegs(design, n);
  toggleEngine(design, engineBeam.id, n.nozzle1.id, { thrust: 60, throttle: 0 });
  toggleTank(design, tank.id);
  toggleRange(design, engineBeam.id, n.nozzle1.id);
  mountCpu(design, tank.id);
  design.program = HOPPER_PROGRAM;
  return design;
}

function twoStage() {
  const design = emptyDesign();
  design.layers = ['First stage', 'Second stage'];
  const n = place(design, {
    footL: [-2, 0], footR: [2, 0], nozzle1: [0, 1], base1: [0, 2], top1: [0, 10], lugL1: [-1, 10], lugR1: [1, 10],
    nozzle2: [0, 11], base2: [0, 12], top2: [0, 16], lugL2: [-1, 12], lugR2: [1, 12],
  });
  const [engine1, tank1] = link(design, [[n.nozzle1, n.base1], [n.base1, n.top1]]);
  link(design, [[n.footL, n.base1], [n.footR, n.base1], [n.footL, n.top1], [n.footR, n.top1], [n.lugL1, n.top1], [n.lugR1, n.top1], [n.lugL1, n.base1], [n.lugR1, n.base1]]);
  const [engine2, tank2] = link(design, [[n.nozzle2, n.base2], [n.base2, n.top2]], 1);
  link(design, [[n.lugL2, n.base2], [n.lugR2, n.base2], [n.lugL2, n.top2], [n.lugR2, n.top2]], 1);
  const separators = link(design, [[n.lugL1, n.lugL2], [n.lugR1, n.lugR2], [n.lugL1, n.lugR2]], 1);
  toggleEngine(design, engine1.id, n.nozzle1.id, { thrust: 120, throttle: 0 });
  toggleEngine(design, engine2.id, n.nozzle2.id, { thrust: 30, throttle: 0 });
  addMotor(design, engine1, tank1, GIMBAL_MOTOR);
  addMotor(design, engine2, tank2, GIMBAL_MOTOR);
  toggleTank(design, tank1.id);
  toggleTank(design, tank2.id);
  for (const beam of separators) toggleSeparator(design, beam.id, 1);
  mountCpu(design, tank2.id);
  design.program = TWO_STAGE_PROGRAM;
  return design;
}

export const PRESETS = {
  hopper: { name: 'Hopper that lands itself', build: hopper },
  twoStage: { name: 'Two-stage rocket', build: twoStage },
  empty: { name: 'Empty', build: emptyDesign },
};
