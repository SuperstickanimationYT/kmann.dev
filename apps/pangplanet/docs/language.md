# Galactic Common Tongue (GCT)

Zorani, Quillith and Vessk all speak GCT. Players decode it over time.

## Glyphs

Six shapes, named by vertex count:

| Digit | Shape | Letter | Sound |
| --- | --- | --- | --- |
| 0 | circle | a | as in "car" |
| 1 | V | o | as in "joe" |
| 2 | N | k | |
| 3 | triangle | d | |
| 4 | square | g | as in "good" |
| 5 | pentagon | z | |

- A shape without a dot is a letter; with a dot inside it is a digit.
- An upside-down T (⊥) separates words.
- Sounds are for reference only; GCT is never spoken in game.

## Writing GCT in text

- Letters are written as their digit: `413` is square, V, triangle.
- Numbers are base 6, most significant digit first, with a dot on every digit. In text each
  digit takes a `•` prefix: 300 is `•1•2•2•0`.
- Spaces stand for ⊥.

## Sounds

- `0` and `1` are vowels; `2` to `5` are consonants.
- No word has two consonants in a row.

## Grammar

- Word order is subject, verb, object: `413 3120 412` is "you trade to me".
- Questions end with `30`: `413 3120 412 30` is "will you trade to me?"
- `20` goes before the verb to negate it: `412 20 3130` is "I don't want".
- Plural is a suffix: `5` after a vowel, `05` after a consonant. `1305` is "golds",
  `41205` is "we", `31505` is "ownerships".
- No two words may share a plural form, so plurals always parse one way.
- Ownership puts `315` between owner and owned: `412 315 130` is "my gold".
- `302` links a thing to what it is: `413 302 200` is "you are a friend".
- `210` means "outsider": anyone who isn't the speaker's species.

## Lexicon

Words cluster by first glyphs: `1x0` resources, `x10` peoples, `4xx` pronouns and places,
`3xxx` verbs, two glyphs for particles.

### Particles

| GCT | English |
| --- | --- |
| `00` | no |
| `11` | yes |
| `20` | not |
| `30` | question (ends a sentence) |
| `5` / `05` | plural (suffix) |

### Resources

| GCT | English |
| --- | --- |
| `100` | stardust |
| `110` | charge |
| `120` | science points |
| `130` | gold |
| `140` | galactokens |
| `150` | crystals |

### Peoples

| GCT | English |
| --- | --- |
| `010` | human |
| `210` | outsider |
| `310` | Quillith |
| `410` | Vessk |
| `510` | Zorani |
| `200` | friend |
| `215` | enemy |

### Pronouns and places

| GCT | English |
| --- | --- |
| `412` | me |
| `413` | you |
| `400` | territory |
| `401` | ship |
| `402` | leave |
| `403` | planet |
| `404` | star |
| `405` | far |
| `414` | near |

### Verbs

| GCT | English |
| --- | --- |
| `302` | is, are, equals |
| `315` | ownership |
| `3010` | drill |
| `3030` | ask |
| `3040` | tell |
| `3120` | give, trade |
| `3130` | want |
| `3140` | pay |

## Sample lines

| Where | GCT | English |
| --- | --- | --- |
| Toll | `413 3140 •1•2•2•0 140 30` | Will you pay 300 galactokens? |
| Toll refused | `413 302 215` | You are an enemy. |
| Hostile system | `413 402 41205 315 400` | You leave our territory. |
| Sample permission | `412 3010 413 315 403 30` | May I drill your planet? |
| Trade | `412 3130 130` | I want gold. |
| Stardust tip | `412 3040 413 100 414` | I tell you of stardust nearby. |
