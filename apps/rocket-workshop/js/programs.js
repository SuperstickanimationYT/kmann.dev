const HOLD_WITH_WHEEL = `# Hold attitude with a reaction wheel.
# Keeps the CPU's beam pointing "aim" degrees from straight up.
# A and D move the aim, so you fly by hand and the CPU does the work.
# Needs: wheel1. Mount the CPU on a beam that was built upright.

keep aim = 0                # degrees from straight up, counterclockwise positive
keep turnRate = 20          # degrees per second while A or D is held
keep stiffness = WHEEL_STIFFNESS      # wheel torque per degree off aim
keep damping = WHEEL_DAMPING        # wheel torque per degree per second of spin

aim = clamp(aim - steer * turnRate * dt, -180, 180)
wheel1.torque = clamp(stiffness * (aim - pitch) - damping * spin, -1, 1)
engine1.throttle = throttle
`;

const HOLD_WITH_GIMBAL = `# Hold attitude by swinging the engine (a gimbal).
# Thrust pushed sideways at the bottom turns the rocket, so this only
# steers while the engine burns. A and D move the aim.
# Needs: engine1, and motor1 between engine1's beam and the rocket.
# Give motor1 a lot of torque (around 30000 N·m) or air drag swings it.

keep aim = 0                # degrees from straight up, counterclockwise positive
keep turnRate = 20          # degrees per second while A or D is held
keep lean = 4               # gimbal degrees per degree off aim
keep damp = 0.6             # gimbal degrees per degree per second of spin
keep most = 15              # largest gimbal angle in degrees

aim = clamp(aim - steer * turnRate * dt, -120, 120)
gimbal = clamp(lean * (pitch - aim) + damp * spin, -most, most)
motor1.power = clamp((gimbal - motor1.angle) * 0.3, -1, 1)
engine1.throttle = throttle
`;

const HOVER = `# Hover at a set height using only the throttle.
# Picks a climb speed from how far off the height is, then sets the
# throttle so thrust cancels weight plus a bit to chase that speed.
# Needs: engine1 pointing down. Steer with something else, or not at all.

keep target = 100           # meters above the ground to hold
keep approach = 0.5         # climb speed in m/s per meter of height error
keep fastest = 10           # never climb or sink faster than this, in m/s
keep response = 2           # how hard the throttle chases that climb speed

wanted = clamp(approach * (target - altitude), -fastest, fastest)
engine1.throttle = clamp(mass * (9.8 + response * (wanted - vspeed)) / engine1.thrust, 0, 1)
`;

const HOP_AND_LAND = `# You fly it up, it lands itself. Hold the throttle up to climb.
# Cut the throttle and the CPU takes over: it waits until the rocket
# falls, then brakes just late enough to stop at the ground, using a
# rangefinder that looks straight down.
# Needs: engine1, and range1 on a beam pointing down at the ground.
# Press Run with the rocket standing on the ground: groundGap is read once then.

keep groundGap = range1.distance   # range1 reading while standing on the ground
keep softness = 0.6         # fall no faster than this share of full braking can stop
keep landingSpeed = 0.5     # m/s to still be falling at touchdown

height = range1.distance - groundGap
brake = engine1.thrust / mass - 9.8
target = -sqrt(softness * brake * max(height, 0)) - landingSpeed

if throttle > 0 then
  engine1.throttle = throttle
elseif vspeed < 0 and height > 0.05 then
  engine1.throttle = clamp(mass * (9.8 + 8 * (target - vspeed)) / engine1.thrust, 0, 1)
else
  engine1.throttle = 0
end
`;

const LAUNCH_TO_ORBIT = `# Launch to orbit with no input.
# 1. Climb straight up to clear the pad.
# 2. Tip over a little, then keep the nose along the direction of travel
#    (a gravity turn), which keeps the rocket end-on to the air.
# 3. Cut the engine once the highest point of the path is high enough.
# 4. Coast up. Near the top, point sideways and burn until the lowest
#    point is above the air. That is an orbit.
# Needs: engine1 and wheel1. To steer with a gimbal instead, swap the
# steering line for the two gimbal lines from "Hold attitude by gimbal".

keep targetApoapsis = 60000 # meters, how high the top of the orbit should be
keep safePeriapsis = 40000  # meters, done once the lowest point is this high (air ends at 35 km)
keep kick = 10              # degrees to tip over after clearing the pad
keep direction = 1          # 1 orbits to the right (clockwise), -1 to the left
keep lead = 30              # start the sideways burn when climbing slower than this, in m/s
keep stiffness = WHEEL_STIFFNESS      # wheel torque per degree off aim
keep damping = WHEEL_DAMPING        # wheel torque per degree per second of spin
keep phase = 1

if phase == 1 then          # straight up
  aim = 0
  engine1.throttle = 1
  if altitude > 200 then phase = 2 end
elseif phase == 2 then      # gravity turn
  aim = -direction * max(kick, -direction * prograde)
  engine1.throttle = 1
  if apoapsis > targetApoapsis then phase = 3 end
elseif phase == 3 then      # coast up to the top
  aim = -direction * 90
  engine1.throttle = 0
  if vspeed < lead and altitude > 35000 then phase = 4 end
elseif phase == 4 then      # sideways burn near the top
  aim = -direction * 90
  engine1.throttle = 1
  if periapsis > safePeriapsis then phase = 5 end
else                        # in orbit
  aim = -direction * 90
  engine1.throttle = 0
end

wheel1.torque = clamp(stiffness * (aim - pitch) - damping * spin, -1, 1)
`;

const AUTO_STAGE = `# Drop the bottom stage when its tank runs dry, then light the next.
# fuel counts every tank still attached to the CPU, so the bottom tank
# is empty once fuel falls to what the tanks above it hold.
# Needs: engine1 below the separators, engine2 above, and sep1 between.

keep upperFuel = 1600       # kilograms of fuel in the tanks above sep1
keep stage = 1

if stage == 1 then
  engine1.throttle = throttle
  if fuel <= upperFuel then
    engine1.throttle = 0
    sep1.fire = 1
    stage = 2
  end
else
  engine2.throttle = throttle
end
`;

const WHEEL_GAINS = { stiffness: 0.1, damping: 0.03 };

function withWheelGains(code) {
  return code.replace('WHEEL_STIFFNESS', String(WHEEL_GAINS.stiffness)).replace('WHEEL_DAMPING', String(WHEEL_GAINS.damping));
}

export const LIBRARY = [
  { id: 'launch', name: 'Launch to orbit', needs: 'engine1, wheel1', code: withWheelGains(LAUNCH_TO_ORBIT) },
  { id: 'hop', name: 'You climb, it lands', needs: 'engine1, range1 pointing down', code: HOP_AND_LAND },
  { id: 'hover', name: 'Hover at a height', needs: 'engine1', code: HOVER },
  { id: 'holdWheel', name: 'Hold attitude by reaction wheel', needs: 'engine1, wheel1', code: withWheelGains(HOLD_WITH_WHEEL) },
  { id: 'holdGimbal', name: 'Hold attitude by gimbal', needs: 'engine1, motor1 on the engine', code: HOLD_WITH_GIMBAL },
  { id: 'stage', name: 'Drop a stage when its tank runs dry', needs: 'engine1, engine2, sep1', code: AUTO_STAGE },
];

export const LAUNCH_PROGRAM = LIBRARY[0].code;
