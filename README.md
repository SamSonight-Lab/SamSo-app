# SamSo

Een synth, sequencer en groovebox voor iPhone en iPad waarmee je muziek maakt door te tekenen. Muziektheorie is niet nodig. De app leest je tekening als muziek en leert van jouw duimpjes wat jij bedoelt.

Het einddoel is een app in de App Store. We beginnen met een **webprototype, het Schetslab**. Daarmee zoeken we snel uit welke tekengebaren goed voelen, en je kunt het meteen in Safari op je iPhone of iPad proberen.

## Schetslab (prototype, map `prototype/`)

### Uitproberen

- **Op je iPad of iPhone:** open de Schetslab-link uit de Claude-sessie, of host de map `prototype/` (bijvoorbeeld met GitHub Pages) en open `index.html` in Safari. Via *Deel → Zet op beginscherm* draait hij schermvullend.
- **Op je computer:** `cd prototype && npx serve .`, open daarna de getoonde URL. Op een iPad in hetzelfde wifi-netwerk werkt het netwerkadres ook.
- `npm run build` maakt `dist/samso-standalone.html`, de hele app in één bestand.

Hoor je niets op een iPhone? Zet de stilschakelaar uit en het volume omhoog.

### De tekentaal (v0.1)

| Je tekent | Wat je hoort |
|---|---|
| Een grote **cirkel** | Een loop. Een wijzer draait rond en alles wat hij raakt, klinkt. Groter = langer: 1, 2 of 4 maten. |
| **Kleur** kiezen | Het instrument: drums, bas, lead, pad, drone, perc of ruis. |
| **Vorm** van de loop | De klank: rond = zacht, vierkant = hol/retro, driehoek = scherp/fel. |
| Tekenrichting van de loop | De draairichting van de wijzer. |
| In de loop: dichtbij het **midden** of bij de **rand** | Laag of hoog. Bij drums: kick, snare, hihat. |
| Een **stip** | Eén noot of slag. |
| Een **stip precies in het midden** | Op elke tel (de puls). |
| Een **lijn** | Een melodie die de lijn volgt. Langs de rand = één lange noot, van binnen naar buiten = een akkoord. |
| **Streepjes** | Ritme. |
| **Zigzag** of krassen | Ruwer, vervormd geluid. |
| Een **spiraal** | Een loopje omhoog of omlaag. |
| Klein **rondje** / **driehoekje** / **vierkantje** in een loop | Akkoord / arpeggio / akkoordstoten. |
| Net **buiten** de rand (zonnestralen!) | Extra hoge, glinsterende noten. Bij drums een open hihat. |
| Druk met de **Apple Pencil** | Zachter of harder. |

Alle noten vallen in een vijftonige toonladder, dus niets klinkt vals. De stemming kies je bovenin (Zonnig, Dromerig, Nacht, Mysterie, Stoer). Daar staan ook tempo, swing en ruimte.

### Wat de app nu leert

- **Duim omlaag** (bovenin) probeert een duidelijk andere sfeer: andere stemming, tempo, swing of ruimte. **Duim omhoog** onthoudt de sfeer. Bij de volgende start begint de app met jouw voorkeur.
- **Tik op het label van een loop** voor de klank. Duim omlaag varieert die klank (feller, korter, ruwer, hoger...), duim omhoog onthoudt hem per instrument en vorm, bijvoorbeeld "bas in een vierkant".
- Onder *··· → Wat de app over jou leerde* zie je wat er geleerd is. Alles blijft op het apparaat.

Dit is bewust eenvoudig: herkenning met geometrie en leren met voorkeuren. Zo is elke stap uit te leggen en te testen. De echte ML-onderdelen staan hieronder in het stappenplan.

### Code

Gewoon JavaScript zonder dependencies. De logica staat los van het scherm, zodat we hem later één op één naar Swift kunnen overzetten.

| Bestand | Rol |
|---|---|
| `src/geometry.js` | Meetkunde: herbemonsteren, oppervlak, convex omhulsel, hoeken |
| `src/shapes.js` | Streepherkenning: stip, lijn, zigzag, spiraal, cirkel, vierkant, driehoek |
| `src/music.js` | Stemmingen (toonladders), instrumenten, toonhoogte |
| `src/reader.js` | De "radar": tekening in een loop → noten per zestiende |
| `src/taste.js` | Leren van duimpjes |
| `src/synth.js` | Web Audio-synthesizer: alle klanken zijn gesynthetiseerd, er zitten geen samples in |
| `src/transport.js` | Klok met vooruitplanning op de audioklok |
| `src/demo.js` | Het voorbeeldvel: drumcirkel, basvierkant, zon met gezicht |
| `src/app.js` | Scherm, invoer (vinger, Pencil, muis), tekenen, panelen |

Testen: `npm test` voor de logica, `npm run e2e` voor een browsertest met Playwright. Die tekent echt, controleert dat er geluid uitkomt, rendert audio offline en maakt screenshots in `test/out/`.

## Stappenplan

1. **Schetslab testen (nu).** Laat mensen zonder muziekkennis ermee spelen. Welke gebaren snappen ze zonder uitleg? Wat voelt magisch en wat frustreert? We passen de tekentaal aan op wat we zien.
2. **Hele tekeningen begrijpen.** Een klein model dat schetsen herkent (gezicht, zon, boot, auto...), bijvoorbeeld getraind op Google's open *Quick, Draw!*-dataset. Een herkende tekening wordt een muzikale intentie: een zon wordt vrolijk en licht, een boot wiegend.
3. **Native iOS-app.** SwiftUI, PencilKit of een eigen tekencanvas, AVAudioEngine (eventueel AudioKit) en Core ML. De pure logica (`geometry`, `shapes`, `reader`, `taste`) zetten we direct over.
4. **Slimmer leren.** Voorkeuren per soort streek en per context, zodat de app jouw handschrift leert lezen. Daarna synth-schema's tekenen (oscillator → filter → envelope, LFO) die de app via duimpjes leert begrijpen. Optioneel een taalmodel dat tekeningen interpreteert.
5. **App Store.** Apple Developer Program, TestFlight-bèta, privacy-labels, export naar audio en MIDI. Later eventueel AUv3 en Ableton Link.
