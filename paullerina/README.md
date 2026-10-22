# The Paullerina

Speeldoos-sampleplayer in ERROR instruments-stijl. De ballerina in de vitrine is een karikatuur van Paul Tas, met zijn toestemming en alleen voor een kleine kring.

## Bediening

- **WIND:** draai de sleutel rechtsom (of tik erop). De veer houdt maximaal 54 seconden; de laatste 15 seconden remt hij af tot stilstand.
- **MODE** (8 standen, het tutu verandert van kleur): BOX, TAPE, REVERSE, GRANULAR, STUTTER, RHYTHMIC, HARMONIC, CHAOTIC
- **SIZE:** de grootte van de stukjes; per modus betekent dat korrel, stap, herhaling of wow.
- **ECHO**, **REVERB**, **DRIVE** (boven de helft gaat het over in feedback)
- **◂ ▸:** wissel van sample; **LOAD:** laad een eigen bestand; **STOP:** rem

De Paullerina is een 3D-figuur (three.js r128, toon-shading met omtreklijnen).

## Samples

`samples/` bevat MP3's van 160 kbps, genormaliseerd naar −16 LUFS, gemaakt van de WAV's in *SAMSO APPS MEDIA*.

## Gepland

- Een modus waarin hij blijft doorlopen
- Native iOS-app

## Techniek

Eén `index.html` met een inline AudioWorklet (granulaire en varispeed-engine, plus een veermodel). De microfoon werkt alleen als de pagina via https of localhost wordt geserveerd.
