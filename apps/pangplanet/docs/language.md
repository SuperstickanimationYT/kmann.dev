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

## Grammar

- Word order is subject, verb, object: `413 3120 412` is "you trade to me".
- Questions end with `33`: `413 3120 412 33` is "will you trade to me?"
- `22` goes before the verb to negate it: `412 22 3210` is "I don't want".
- Plural is a `5` suffix: `4125` is "we". A word already ending in `5` takes `05`: `31505`.
- No word may equal another word plus `5` or `05`, so plurals always parse one way.
- Ownership puts `315` between owner and owned: `412 315 130` is "my gold".
- `302` links a thing to what it is: `413 302 240` is "you are a friend".
- `210` means "outsider": anyone who isn't the speaker's species.

## Lexicon

Words cluster by first glyphs: `1x0` resources, `x10` peoples, `4xx` pronouns and places,
`3xxx` verbs, doubled glyphs for particles.

### Particles

| GCT | English |
| --- | --- |
| `00` | no |
| `11` | yes |
| `22` | not |
| `33` | question (ends a sentence) |
| `5` | plural (suffix) |

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
| `240` | friend |
| `250` | enemy |

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
| `420` | near |
| `430` | far |

### Verbs

| GCT | English |
| --- | --- |
| `302` | is, are, equals |
| `315` | ownership |
| `3120` | give, trade |
| `3140` | pay |
| `3210` | want |
| `3230` | ask |
| `3240` | tell |
| `3250` | drill |

## Sample lines

| Where | GCT | English |
| --- | --- | --- |
| Toll | `413 3140 •1•2•2•0 140 33` | Will you pay 300 galactokens? |
| Toll refused | `413 302 250` | You are an enemy. |
| Hostile system | `413 402 4125 315 400` | You leave our territory. |
| Sample permission | `412 3250 413 315 403 33` | May I drill your planet? |
| Trade | `412 3210 130` | I want gold. |
| Stardust tip | `412 3240 413 100 420` | I tell you of stardust nearby. |
