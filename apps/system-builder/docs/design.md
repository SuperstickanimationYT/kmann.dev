# System Builder design

A planetary system editor built on real physics. You use it for worldbuilding and export the result to games. Version 1 exports to Spaceflight Simulator (SFS). KSP comes later.

## Version 1 scope

- Edit a system of stars, planets and moons at real scale and in real units.
- Draw it as a flat, top-down 2D map.
- Store and simulate orbits in 3D, so a 3D view and the KSP export can come later without changing the data model.
- Check stability instantly on every edit, and run an N-body simulation on request.
- Export an SFS planet pack.

Apps in this repo import nothing from each other. Code worth reusing gets copied in:

- `star-systems/js/kepler.js` for orbit positions
- the leapfrog stepper in `gravity-playground/js/physics.js`
- the mass-to-radius and habitable zone functions in `planet-calculator/js/physics.js`

## Data model

```js
system = {
  name, author, description,
  epoch,          // the date mean anomalies refer to
  home,           // id of the body the SFS space center sits on
  bodies: [body],
}

body = {
  id, name,
  kind,           // 'star' | 'planet' | 'moon' | 'minor'
  parent,         // id, null for the root
  massKg,
  radiusM,
  color,          // map colour
  atmosphere,     // null, or { heightM, surfaceDensity }
  orbit: {        // null for the root
    a,            // semi-major axis, m
    e,
    i,            // inclination, deg; over 90 means retrograde
    node,         // longitude of ascending node, deg
    peri,         // argument of periapsis, deg
    meanAnomaly,  // deg, at epoch
  },
}
```

Each body stores mass. Surface gravity is computed from mass, because both stability and the simulation need mass. Orbits are relative to the parent, which is how both games describe them.

A binary star is a star whose parent is the other star. That matches SFS and KSP. The simulation still treats the pair as two bodies orbiting each other.

## SFS pack format

Observed in the five packs installed on this machine: `Example`, `Testing World`, `KSP System`, `Galaxy` and `Mini Milky Way 1.6.04`. They live in `Spaceflight Simulator_Data/Custom Solar Systems/`.

```
<Pack name>/
├── Version.txt              game version, e.g. 1.6.00.16
├── Import_Settings.txt      includeDefaultPlanets/Heightmaps/Textures, author, version, description
├── Space_Center_Data.txt    { address: <body>, angle, position_LaunchPad }
├── Planet Data/<Body>.txt   one JSON file per body; the filename is the body's name
├── Heightmap Data/          optional custom heightmaps
└── Texture Data/            optional custom textures
```

Planet files use format version `"1.5"`. The fields that matter for orbits:

```json
"BASE_DATA":  { "radius": 314970.0, "gravity": 9.8, "timewarpHeight": 25000.0, "mapColor": {...} },
"ORBIT_DATA": { "parent": "Sun", "semiMajorAxis": 7480000000.0, "eccentricity": 0.0,
                "argumentOfPeriapsis": 0.0, "direction": 1, "multiplierSOI": 2.5 }
```

The root body has no `ORBIT_DATA`. `direction` is `-1` for retrograde orbits (Triton). There is no inclination, node or starting anomaly. Every other section is visual or gameplay data: atmosphere, terrain, water, rings, post-processing, achievements and landmarks.

Older packs use a different format with `●BASE_DATA●` section headers and a circular `orbitHeight` instead of `semiMajorAxis`. Most of Mini Milky Way is in that format. Version 1 writes the 1.5 format only.

## Scale

The stock system in `Example` uses these ratios to reality:

| | real ÷ SFS |
| --- | --- |
| radii | 20 |
| planet semi-major axes | 20 |
| moon semi-major axes | 25 (Io, Titan, Triton), 34.3 (the Moon) |
| surface gravity | 1, mostly |

Surface gravity stays real while lengths shrink by 20. Assuming SFS computes GM as gravity × radius², masses therefore drop by 400 and orbital periods by √20 ≈ 4.5. Mass ratios stay the same, so Hill radii and spheres of influence shrink by the same 20 as everything else. A system that passes the stability checks at real scale passes them at SFS scale too.

The export divides every length by one scale factor k and keeps surface gravity. k defaults to 20, matching stock. The moon squeeze is left out of version 1. It isn't physical, and a single factor keeps the stability verdict valid.

The difficulty multipliers (`smaDifficultyScale`, `radiusDifficultyScale` and so on) are left empty.

## Flattening to 2D

SFS has one orbital plane, so the export drops inclination:

- `argumentOfPeriapsis` = node + peri for prograde orbits, node − peri for retrograde, mod 360. This keeps the direction of periapsis as seen from above.
- `direction` = −1 when i > 90°, else 1.
- `meanAnomaly` is dropped. The files have no field for starting position.

The editor shows a note on any body with i over about 5°, saying its tilt will not reach SFS.

## Stability checks

These run on every edit and are drawn on the map:

| Check | Fails when | Source |
| --- | --- | --- |
| Inside parent | periapsis < parent radius + body radius | geometry |
| Roche limit | periapsis < 2.44 R_parent (ρ_parent/ρ_body)^⅓ | fluid Roche limit |
| Moon too far out | apoapsis > 0.49 R_Hill of parent (0.93 if retrograde) | Domingos, Winter & Yokoyama 2006 |
| Crossing orbits | siblings' periapsis–apoapsis ranges overlap | geometry |
| Sibling spacing | Δ = (a₂ − a₁) / R_H,mutual < 2√3 fails, < 10 warns | Gladman 1993; Chambers, Wetherill & Boss 1996 |

The mutual Hill radius is R_H,mutual = ((m₁ + m₂) / 3M)^⅓ · (a₁ + a₂)/2.

The checks also tag near mean-motion resonances such as 2:1 and 3:2, for information only. Resonances can stabilise or destabilise a system, and only the simulation can tell which.

## Simulation

- Bodies are placed in 3D from their orbits at the epoch, relative to the system's barycentre.
- A Web Worker steps a symplectic integrator: Wisdom–Holman for planets around a dominant star, leapfrog with a step set by the shortest orbit.
- The run length is counted in orbits of the outermost planet, 10⁴ by default.
- The run stops on the first event and reports it with the time it happened. Events are a collision, an escape (a body becomes unbound from its parent), or a close encounter inside one mutual Hill radius.
- The 2D map shows the run live, projected top-down.

## SFS export details to confirm in the game

- Which sections a body needs to load and render. The `Galaxy` pack leaves out the difficulty-scale keys, which suggests they are optional. The plan is to write `BASE_DATA`, `ORBIT_DATA`, `ACHIEVEMENT_DATA`, an empty `LANDMARKS`, and a stock `TERRAIN_DATA` per kind: rocky, icy or gas. Stars get no terrain, like the stock Sun.
- How to pick `timewarpHeight` and `multiplierSOI`. Stock values: Earth 25 km on a 315 km radius, Moon 5 km on 86.5 km, Sun 500 km. SOI multipliers are 2.5 for Earth and 1.35 for the Moon.
- Whether SFS computes GM as gravity × radius².
- How the pack reaches the game. Desktop takes a folder. Mobile is to be found out. The likely answer is a zip, written by a small store-only zip writer so no dependency is added.

## Later

- Import SFS packs in both formats, to check stability of existing packs. The `Galaxy` pack has two files with JSON syntax errors (`Nereid.txt` among them), so the importer must report those instead of failing.
- 3D view.
- KSP export through Kopernicus configs, which take the full orbit.
