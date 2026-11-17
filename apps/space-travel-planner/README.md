# Space Travel Planner

Plans chemical-rocket missions through the Solar System in 3D, using real planet positions, real launchers and real parts.

This folder has no page yet. It holds the orbital math the planner will run on.

- `js/ephemeris.js` gives planet positions and velocities from JPL's approximate Keplerian elements (Standish and Williams, published at https://ssd.jpl.nasa.gov/planets/approx_pos.html). It uses Table 1 for 1800 to 2050 and Table 2a with the Table 2b terms outside that range.
- `js/kepler.js` converts between orbital elements and position/velocity, and propagates two-body orbits with universal variables.
- `js/lambert.js` solves Lambert's problem with Izzo's method, for transfers with zero full revolutions.

## Checks

```bash
node --test "apps/space-travel-planner/checks/*.test.mjs"
```

The ephemeris checks compare against JPL Horizons vectors saved in `checks/horizons-vectors.mjs`. Each planet must land within 3 times JPL's published error for the table in use. For longitude, the check also accepts errors up to the angle 0.01 au spans at the planet's distance. The Sun moves about that far around the Solar System's barycenter, and the elements cannot track that motion, so Neptune lands 30 to 45 arcseconds off against JPL's stated 10.

The Kepler and Lambert checks use worked examples from Curtis, *Orbital Mechanics for Engineering Students* (examples 3.7, 4.3 and 5.2), and confirm that flying each Lambert solution lands on its target.
