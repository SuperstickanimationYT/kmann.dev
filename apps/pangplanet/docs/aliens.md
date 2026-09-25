# Aliens

Three alien species share the galaxy. Each can be friendly or hostile toward you, and the
hostility plays out through the economy and logistics. There is no combat.

## Species and homeworlds

- Each species owns a third of the galaxy, split by angle around the galactic center. The
  species whose wedge holds the Solar System is the home species.
- About 1 in 8 generated star systems has a homeworld: one of its planets carries a
  `species` tag. The placement is seeded, so a galaxy always has the same aliens.
- Each species has a name, a colour, a rival, and one resource it wants: Zorani gold,
  Quillith crystals, Vessk charged batteries. Science stays the tip currency.
- A homeworld's star system is that species' territory.

## Contact

- Land on a homeworld to open that species' panel.
- The first contact with each species pays science (`contact:<species>` study).

## Homeworld samples

- The first sample drilled on a homeworld pays 200 science instead of the usual 20–150.
  Like every sample, it pays once per planet.
- Drilling it without permission costs 10 relation.
- The homeworld panel offers to ask first. The answer is rolled once per homeworld and
  saved: 15% yes, 75% for a 100 galactoken fee, 10% no. The fee stays well under the
  sample's 1000 galactoken resale value.
- Freighters can't grant permission; only the homeworld can.

## Biosignatures

- Life means an alien homeworld; there are no bacteria-only worlds.
- The telescope (and solar sails) flag possible biosignatures on the stars they chart. No
  homeworld goes unflagged, and 3 flags in 4 are real. The false alarm chance per lifeless
  system is derived from the homeworld chance (1 in 21 at 1 in 8).
- Flags are seeded per system, so rescanning never changes them. Visiting settles it: the
  map shows the species' colour, or notes the false alarm.

## Relations

- One number per species, from -100 to +100. Friendly at +30 and above, hostile at -30 and
  below, wary in between.
- Starting moods: home species +40, one neutral species at 0, and the home species' rival
  at -40.
- Selling a species what it wants raises relations by 1 per 50 galactokens of market
  value.
- Each crystal found in its territory costs 5 relation, each stardust 15.

## Friendly perks

- **Stardust tip**: pay science, and the species names the nearest system with stardust
  that you haven't visited, within 5 sectors of its homeworld. The system is charted with
  its stardust count filled in, so the violet ring shows on the galaxy map. The price
  starts at 200 science and drops as the species gets friendlier.
- They pay 1.5× the market price for the resource they want. Everyone else pays the
  market price.

Hostile species refuse to give tips. They never sell false ones.

## Hostile effects

A hostile species' system is the space within 4M of its homeworld star, the range that
counts as visiting.

- **Toll**: entering their system opens a toll panel: pay 300 galactokens, or refuse for
  -10 relation. Closing the panel refuses. Asked once per visit; leaving resets it.
- **Hauler raids**: a hauler arriving at a stop in their system has a 30% chance of losing
  half its gold and charge, then pauses 60s (stall kind `raided`).
- **No outposts**: satellites, banks, rigs, antennas and drones can't be deployed in their
  system, and builders refuse build stops there. Outposts already there stay.
- No tips.

## Alien ships and raids

- While you're in a star system, a freighter arrives on average every 10 game-minutes,
  one at a time. It belongs to the species with the nearest homeworld within 6 sectors of
  that star; with none in reach, no ships come. The Solar System gets Zorani ships.
- A freighter crosses the system in a straight line at 20–40 per tick, entering and
  leaving 4M from the star. Ships aren't saved; a reload clears the current one.
- **Meeting** a freighter: within 1.5K at a relative speed under 10 (the landing rule).
  Docking matches your velocity to its own. The panel offers the same trade and tips as
  its homeworld, with tips searched around the ship.
- **Raid**: the cargo is 200–600 galactokens, 0–3 crystals and a 10% chance of 1
  stardust. It costs -25 relation with the ship's species and gives +10 with its rival
  (Zorani and Quillith: Vessk; Vessk: Zorani). The button shows both before you commit.

## Rollout

1. Homeworlds, contact science, stardust tips
2. Wanted resources, trade prices, mining anger
3. Tolls and hauler raids
4. Alien ships and player raids

