# Lore

Mechanics come first: features exist because they're fun or balanced. This is the story
that explains them after the fact. When lore and code disagree, change the lore.

## The Ancients

- Life began once in the whole Galaxy, on a world near the galactic core, about 8 billion
  years ago. The Ancients evolved there. That world is **Origin**.
- They grew into a Galaxy-wide empire and built wormholes between distant stars for fast
  travel. The generated wormhole pairs, the Sun Wormhole and the Core Gateway are theirs.
- Over hundreds of thousands of years of expansion they found no other life. They decided
  to spread it themselves, and built **Seeders**: self-running probes that drift between
  stars and drop microbes on any world that can hold them.
- A catastrophe nobody understands wiped out the Ancients. Their Seeders kept working for
  billions of years without them. That's how Earth, which formed 4.5 billion years ago,
  got life.

## The five species

Every living thing in the Galaxy descends from Ancient seed stock. Simple life turns into
intelligence very rarely: only five species have ever done it.

1. **Ancients**: extinct.
2. **Vessk**: the first to rise after the Ancients. They decoded the Ancients' script and
   built the Galactic Common Tongue (GCT) from it.
3. **Zorani**
4. **Quillith**
5. **Humans**: very late arrivals.

The three older species have spoken GCT with each other for millions of years and spread
across thousands of worlds. In game, every world tagged with a species is a colony. Humans
start with one rocket, a few galactokens and no GCT, which is why you decode it word by
word.

## The Earth market

A trade exchange run by human brokers, humanity's only trading post.

- Brokers buy what you bring back and resell it to Zorani freighters, which call at the
  Solar System for that cargo. They pay you 10 per gold, sell it on for 15 and keep the
  difference. Selling to the Zorani yourself cuts them out, hence the 1.5× price.
- The brokers are human, so trading with them needs no GCT. They know just enough to
  trade and don't teach it.
- Haulers deliver only here: the exchange takes contracted automated drops, aliens don't.
- It sells human-built and resold alien tech. The top upgrade tiers need crystals and
  stardust because humans can't make those parts themselves.
- Galactokens are the Galaxy's common currency. Humans only started earning them through
  the exchange, so you start with 200. You're one of the first to fly out and find goods
  instead of waiting for freighters: the brokers' supplier.

## Scale

- One game unit is 10 cm, so Earth's surface gravity comes out at 9 m/s². The rocket is
  9 m tall; planets are tiny (Earth's radius is 1 km).
- In this galaxy c, the speed of light, is 300 m/s: normal flight's top speed. FTL drives
  go past it, so their speeds read as multiples of c (10c to 10,000c). The in-game help
  says so.
- Code keeps its own units (units per tick); `js/units.js` converts for display.

## How it shows up in game

| Lore | Mechanic |
| --- | --- |
| Ancients built the wormholes | Wormhole pairs, Sun Wormhole, Core Gateway |
| Origin, the Ancient homeworld | The Origin world by the galactic core (2000 science to land) |
| Seeders spread life | Simple-life worlds; Ancient Seeders between the stars |
| GCT came from Ancient script | Six-glyph writing, decoded by hearing words |
| Humans arrived last | Weak start; all three species already know GCT |
| Human brokers run the exchange | Market near Earth pays market price; Zorani pay 1.5× when friendly; haulers sell only there |

## Ancient Seeders

- About 1 sector in 30 has a Seeder in interstellar space, away from its star. Seeded, so a
  galaxy always has the same ones.
- A telescope scan charts Seeders in range. Flying within 4M of one also charts it. The
  galaxy map shows them as lime pods, faded once opened.
- Seeders have no gravity. Land on one gently (autopilot works) to open it: 500 science and
  2 stardust, once per Seeder.

## Open threads

- What destroyed the Ancients.
- Whether any Seeders still work.
