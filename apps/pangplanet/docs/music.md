# Music

All music is synthesized in the browser by a copy of Song Studio's engine in `js/music/`.
There are no audio files.

## When music plays

- **Background:** after the first click or key press, one of the three ambient pieces in
  `AMBIENT_SONGS` plays twice, then the game is quiet for 1 to 2.5 minutes before the next.
- **Milestones:** each entry in `MILESTONES` (`js/milestones.js`) plays its song once per
  world, the first time it's reached. Background music fades out under it. If two land at
  once, they play one after the other.
- Milestones reached before music existed are marked heard silently when an old save loads.
- Settings has separate sliders for background and milestone music.

| Milestone | Song |
|---|---|
| First liftoff | Liftoff |
| Land on the Moon | Moon landing |
| Reach the Sun | Into the light |
| Another star system | New horizon |
| First alien contact | Sunny loop, three times |
| Leviathan | Leviathan |
| Galactic core | Koto garden |
| Leave the galaxy | Night drive, twice |
| A dwarf galaxy | Island of stars |

## Swapping in a Song Studio song

1. Make the song in Song Studio and press **Copy share link**.
2. In `js/music/songs.js`, replace a milestone's `song:` with `shareCode:` and paste the link:

   ```js
   galacticCore: { shareCode: 'https://kmann.dev/apps/song-studio/#s=...', loops: 1 },
   ```

Muted tracks are left out, and solo works the same as in Song Studio. Share codes only work
in `MILESTONE_SONGS`; ambient pieces are written out in `songs.js` directly.
