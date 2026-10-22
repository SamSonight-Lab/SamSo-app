# The Paullerina

Speeldoos-sampleplayer in ERROR instruments-stijl. De ballerina in de vitrine is een karikatuur van Paul Tas, met zijn toestemming en alleen voor een kleine kring.

## Bediening

- **WIND:** draai de sleutel rechtsom (of tik erop voor een kwartslag). De veer houdt tot 12 slagen. De sample speelt en de Paullerina danst. Als de veer afloopt, vertraagt alles tot het stilstaat, net als een echt speeldoosje.
- **Modi:** de kleur van het tutu verandert per modus.
  - BOX (roze): het tempo zakt, de toonhoogte blijft (granulair)
  - TAPE (goud): varispeed met een beetje wow, de toonhoogte zakt mee
  - REVERSE (blauw): speelt achteruit
  - SHATTER (paars): granulaire splinters, die wilder worden naarmate de veer afloopt
- **◂ ▸:** wissel van sample. Bij het opstarten staat SWANLAKE BOX klaar.
- **STOP:** rem. De veer blijft gespannen; tik nog eens om verder te spelen.
- **REC:** vasthouden om met de microfoon op te nemen. De opname wordt een nieuwe sample.
- **LOAD:** laad een eigen geluidsbestand.

## Samples

`samples/` bevat MP3's van 160 kbps, genormaliseerd naar −16 LUFS, gemaakt van de WAV's in *SAMSO APPS MEDIA*.

## Gepland

- Een modus waarin hij blijft doorlopen
- Reverb, echo en feedback/overdrive
- Native iOS-app

## Techniek

Eén `index.html` met een inline AudioWorklet (granulaire en varispeed-engine, plus een veermodel). De microfoon werkt alleen als de pagina via https of localhost wordt geserveerd.
