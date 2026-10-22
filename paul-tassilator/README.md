# Paul Tassilator

Glitchy chaos-oscillator in ERROR instruments-stijl. Eén zelfstandig bestand (`index.html`) zonder build of dependencies. Openen in Safari of Chrome en op RUN tikken.

## Wat zit erin

- **Vijf klankengines**
  - CLASSIC: Lorenz-attractor, rungler, acht timbre-modellen, frequency shifter, LFO
  - SWARM: een zwerm deeltjes vormt de golfvorm
  - GENE: wiskundige formules die muteren en kruisen
  - ECO: stemmen als organismen die eten, paren en sterven
  - LIFE: een cellulaire automaat als golfvorm
  - MORPH: glijdt zelf van engine naar engine
- **MODE:** HOLD, AUTO of WILD bepaalt of scènes wisselen
- **MEMORY I–IV:** tik om te laden, houd vast om op te slaan. Slaat ook de patronen, het genoom, de populatie en de automaat op.
- **Touch-filter op het ronde scherm:** X is de cutoff, Y de resonantie. LATCH houdt het filter vast, REC neemt een beweging op en loopt die.
- **FLUX:** van vast tempo via faseren naar polytempo en uiteenvallende tijd
- **DRIVE:** overdrive die boven de helft overgaat in een feedbacklus
- **MUTATE, FREEZE en DRIFT**

De app start altijd in de fabrieksstand: HOLD, CLASSIC en lege geheugenbanken.

## Techniek

- Web Audio met een AudioWorklet. De DSP staat inline in `<script type="text/worklet">`.
- De worklet laadt via een blob-URL, met een data-URL als terugvaloptie. Daardoor werkt het ook als lokaal bestand (`file://`).
- Getest in Chromium en Safari op iOS.

## Later

Native iOS-app via Xcode. De DSP en de interface kunnen grotendeels hergebruikt worden, bijvoorbeeld in een WKWebView-wrapper of met een port naar AudioKit.
