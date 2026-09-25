# Aliens

Three alien species share the galaxy. Each can be friendly or hostile toward you, and the
hostility plays out through the economy and logistics. There is no combat.

## Species and homeworlds

- Each species owns a third of the galaxy, split by angle around the galactic center. The
  species whose wedge holds the Solar System is the home species.
- About 1 in 8 generated star systems has a homeworld: one of its planets carries a
  `species` tag. The placement is seeded, so a galaxy always has the same aliens.
- Each species has a name, a colour, a rival, and one resource it wants (gas, crystals,
  gold or science).

## Contact

- Land on a homeworld to open that species' panel.
- The first contact with each species pays science (`contact:<species>` study).

## Relations

- One number per species, from -100 to +100. Friendly at +30 and above, hostile at -30 and
  below, wary in between.
- Starting moods: home species +40, one neutral species at 0, and the home species' rival
  at -40.
- Relations rise when you sell a species what it wants or give gifts. They fall when you
  mine on worlds in its territory.

## Friendly perks

- **Stardust tip**: pay science, and the species names the nearest system with stardust
  that you haven't visited, within 5 sectors of its homeworld. The system is charted with
  its stardust count filled in, so the violet ring shows on the galaxy map. The price
  starts at 200 science and drops as the species gets friendlier.
- Better prices on the resource they want.
- Permission to build outposts in their systems.

Hostile species refuse to give tips. They never sell false ones.

## Hostile effects

- Toll to enter the SOI of one of their systems. Refusing drops relations.
- Haulers routed through their systems sometimes lose cargo (new stall kind `raided`).
- No tips.

## Alien ships and raids

- Each species sometimes sends a ship from its homeworld through nearby systems, the
  Solar System included. Ships fly straight legs at constant speed, like haulers, and a
  toast announces one when it enters your system.
- **Raid** by matching its velocity: get within range at a relative speed under 10, the
  same rule as landing. The cargo is galactokens and crystals, with a small chance of 1
  stardust.
- A raid costs -25 relation with the ship's species and gives +10 with its rival. The
  toast shows both before you commit.
- Meeting a friendly ship the same way opens trade or a tip instead.

## Rollout

1. Homeworlds, contact science, stardust tips
2. Relations change, wanted resources, better prices
3. Tolls and hauler raids
4. Alien ships and player raids

Toll size and raid rates get tuned in play during phase 3.
