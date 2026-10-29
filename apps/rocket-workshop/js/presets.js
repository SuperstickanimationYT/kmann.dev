import { addBeam, addMotor, addNode, emptyDesign, mountCpu, toggleEngine, toggleRange, toggleSeparator, toggleTank, toggleWheel } from './design.js';
import { assemble, starterParts } from './parts.js';
import { LAUNCH_PROGRAM } from './programs.js';

const HOPPER_PROGRAM = `# Hop: climb for 5 seconds, coast up and fall back, then land
# softly. range1 looks down from the engine, so it measures
# the height of the nozzle above the ground.

keep nozzleHeight = 1       # range1 reading while standing on the pad
keep phase = 1

height = range1.distance - nozzleHeight

if phase == 1 then          # climb
  engine1.throttle = 1
  if time > 5 then phase = 2 end
elseif phase == 2 then      # fall, then brake just in time
  brake = engine1.thrust / mass - 9.8
  target = -sqrt(0.6 * brake * max(height, 0)) - 0.5   # fall no faster than braking at 30% of full can stop
  if vspeed > 0 then
    engine1.throttle = 0
  else
    engine1.throttle = clamp(mass * (9.8 + 8 * (target - vspeed)) / engine1.thrust, 0, 1)
  end
  if height < 0.05 then phase = 3 end
else                        # landed
  engine1.throttle = 0
end
`;

const TWO_STAGE_PROGRAM = `# Fly-by-wire. You fly: Z for full throttle, X to cut,
# A and D to steer. The CPU keeps the rocket pointing where
# you aim by swinging both engines on their motors, and drops
# the first stage when its tank runs dry. The upper tank holds
# 1600 kg, so fuel falls to 1600 when the lower tank is empty.

keep stage = 1
keep aim = 0                # pitch you are steering toward
keep turnRate = 20          # degrees per second while A or D is held
keep lean = 4               # gimbal degrees per degree off aim
keep damp = 0.6             # gimbal degrees per degree per second of spin

aim = clamp(aim - steer * turnRate * dt, -120, 120)
gimbal = clamp(lean * (pitch - aim) + damp * spin, -15, 15)

if stage == 1 then
  engine1.throttle = throttle
  motor1.power = clamp((gimbal - motor1.angle) * 0.3, -1, 1)
  if fuel <= 1600 then
    engine1.throttle = 0
    sep1.fire = 1
    stage = 2
  end
else
  engine2.throttle = throttle
  motor2.power = clamp((gimbal - motor2.angle) * 0.3, -1, 1)
end
`;

const ORBITER_THRUST = 150;
const ORBITER_WHEEL_TORQUE = 60;

const GIMBAL_MOTOR = { mode: 'spin', power: 0, stallTorque: 30000, freeRpm: 30 };

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
  toggleEngine(design, engineBeam.id, n.nozzle1.id, { thrust: 60 });
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
  toggleEngine(design, engine1.id, n.nozzle1.id, { thrust: 120, gimbal: 0 });
  toggleEngine(design, engine2.id, n.nozzle2.id, { thrust: 30, gimbal: 0 });
  addMotor(design, engine1, tank1, GIMBAL_MOTOR);
  addMotor(design, engine2, tank2, GIMBAL_MOTOR);
  toggleTank(design, tank1.id);
  toggleTank(design, tank2.id);
  for (const beam of separators) toggleSeparator(design, beam.id, 1);
  mountCpu(design, tank2.id);
  design.program = TWO_STAGE_PROGRAM;
  return design;
}

function orbiter() {
  const design = emptyDesign();
  design.layers = ['Orbiter'];
  const n = place(design, { footL: [-2, 0], footR: [2, 0], nozzle1: [0, 1], base1: [0, 2], top1: [0, 12], nose: [0, 14], shoulderL: [-1, 12], shoulderR: [1, 12] });
  const [engineBeam, tank, noseBeam] = link(design, [[n.nozzle1, n.base1], [n.base1, n.top1], [n.top1, n.nose]]);
  bottomStageLegs(design, n);
  link(design, [[n.shoulderL, n.nose], [n.shoulderR, n.nose], [n.shoulderL, n.base1], [n.shoulderR, n.base1], [n.shoulderL, n.top1], [n.shoulderR, n.top1]]);
  toggleEngine(design, engineBeam.id, n.nozzle1.id, { thrust: ORBITER_THRUST });
  toggleTank(design, tank.id);
  toggleWheel(design, noseBeam.id);
  design.wheels[0].torque = ORBITER_WHEEL_TORQUE;
  return design;
}

function autoOrbiter() {
  const design = orbiter();
  mountCpu(design, design.beams[1].id);
  design.program = LAUNCH_PROGRAM;
  return design;
}

export const PRESETS = {
  partsTwoStage: { name: 'Two-stage rocket', build: () => assemble(starterParts()), parts: true },
  partsEmpty: { name: 'Empty pad', build: () => assemble([]), parts: true },
  hopper: { name: 'Hopper that lands itself', build: hopper },
  twoStage: { name: 'Two-stage rocket you fly', build: twoStage },
  orbiter: { name: 'Orbiter with a reaction wheel', build: orbiter },
  autoOrbiter: { name: 'Orbiter that flies itself to orbit', build: autoOrbiter },
  empty: { name: 'Empty (beams)', build: emptyDesign },
};
