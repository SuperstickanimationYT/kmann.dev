# Space Travel Planner

Plans chemical-rocket missions through the Solar System in 3D, using real planet positions, real launchers and real parts.

The page searches launch windows between two planets and draws the chosen trajectory in 3D.

- `js/ephemeris.js` gives planet positions and velocities from JPL's approximate Keplerian elements (Standish and Williams, published at https://ssd.jpl.nasa.gov/planets/approx_pos.html). It uses Table 1 for 1800 to 2050 and Table 2a with the Table 2b terms outside that range.
- `js/kepler.js` converts between orbital elements and position/velocity, and propagates two-body orbits with universal variables.
- `js/lambert.js` solves Lambert's problem with Izzo's method, for transfers with zero full revolutions.
- `js/transfer.js` turns a Lambert solution into launch energy (C3), launch direction (DLA, in Earth's equatorial frame) and arrival speed.
- `js/porkchop.js` fills a grid of launch date by trip length. `js/porkchop-worker.js` runs it off the main thread, and `js/porkchop-plot.js` draws it.
- `js/launchers.js` holds payload-versus-C3 curves for Falcon 9, Falcon Heavy, Vulcan and New Glenn, taken from NASA's Launch Services Program performance site.
- `js/parts.js` lists real engines (RL10C-1, RL10B-2, AJ10-190, R-4D-11) and the Star 48BV solid motor, with the source of each number.
- `js/boiloff.js` models cryogenic boil-off. Hydrogen rates come from Centaur flight data and a NASA insulation test. Oxygen and other tank sizes scale with tank area per kilogram and heat of vaporization, and the solar part of the heat leak falls with distance squared.
- `js/mission.js` flies the sequence: launcher, departure top-up burn, cruise boil-off, orbit insertion. It applies the rocket equation stage by stage, and counts leftover oxygen as dead weight once hydrogen runs short.
- `js/flyby.js` models a powered flyby: it finds the closest approach that bends the path from the incoming to the outgoing direction, then charges a burn at closest approach for any speed mismatch. When even the lowest safe pass can't bend the path far enough, it adds a steering burn for the rest. `transfer.js` chains two Lambert legs through the flyby planet and searches the flyby date for each porkchop cell.
- `js/presets.js` holds example missions. Each one is checked to work or fail by at least 0.2 km/s at the app's grid resolution.
- `js/view.js` and `js/camera.js` draw orbits and the trajectory in 3D on a 2D canvas, with lines dropped to the ecliptic so tilt shows.

## Assumptions

- Burns are instant. The report warns when a burn runs longer than 20 minutes, since a real one would lose more to gravity.
- A storable tank adds 10% of its propellant mass in tanks and structure. A hydrolox tank adds 9.9%, from Centaur.
- Three quarters of the boil-off heat at 1 au comes from sunlight. The rest is the spacecraft's own heat and doesn't fade with distance.
- A solid motor fires completely. Any Δv beyond what the burn needs is wasted.

## Checks

```bash
node --test "apps/space-travel-planner/checks/*.test.mjs"
```

The ephemeris checks compare against JPL Horizons vectors saved in `checks/horizons-vectors.mjs`. Each planet must land within 3 times JPL's published error for the table in use. For longitude, the check also accepts errors up to the angle 0.01 au spans at the planet's distance. The Sun moves about that far around the Solar System's barycenter, and the elements cannot track that motion, so Neptune lands 30 to 45 arcseconds off against JPL's stated 10.

The transfer checks compare against real launches. Mars 2020 must match ULA's published C3 of 14.49 km²/s² within 0.5 (it gives 14.50). New Horizons must land near its planned window of 157.7 to 163.9 km²/s² (it gives 158.6).

The flyby checks fly Voyager 1 and 2 past Jupiter on their real dates. Both need under 0.1 km/s of burn, and the closest approach lands within 10% of the real one: 4.72 vs 4.88 Jupiter radii for Voyager 1, 9.67 vs 10.1 for Voyager 2.

The Kepler and Lambert checks use worked examples from Curtis, *Orbital Mechanics for Engineering Students* (examples 3.7, 4.3 and 5.2), and confirm that flying each Lambert solution lands on its target.
