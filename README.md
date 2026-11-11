<p align="center">
  <img src="./icon.svg" alt="Koriander Padel Toss" width="88" />
</p>

<h1 align="center">🎾 Koriander Padel Planner</h1>

<p align="center">
  <strong>Van spelerslijst naar speelindeling, zonder gedoe.</strong><br />
  Een eenvoudige webapp voor padelavonden, met vier speelvormen in één overzicht.
</p>

<p align="center">
  <a href="https://hound83.github.io/padel-toss-kotc-americano/"><strong>▶️ OPEN DE PADEL PLANNER</strong></a>
</p>

<p align="center">
  <strong>Directe URL:</strong> <a href="https://hound83.github.io/padel-toss-kotc-americano/">https://hound83.github.io/padel-toss-kotc-americano/</a><br />
  <em>Werkt op telefoon, tablet en computer. Geen account nodig.</em>
</p>

---

## Kies je speelvorm

| Speelvorm | Wat doet de app? |
| :--- | :--- |
| 🎾 **Toss** | Genereert een speelschema voor de hele groep. Geen uitslagen bijhouden nodig. |
| ⚖️ **Gesplitste Toss** | Deelt spelers in binnen niveaugroepen (**Zilver**, **Goud** en **Platina**), zodat je per groep passende wedstrijden kunt organiseren. |
| 🏆 **Americano** | Maakt een speelschema en houdt scores en een klassement bij. |
| 👑 **King of the Court (KOC)** | Genereert **alleen de startindeling** per baan. Daarna spelen en schuiven de spelers zelf door volgens de KOC-regels. |

> **Toss en King of the Court zijn verschillende speelvormen.** De KOC-functie is bedoeld als hulpmiddel om te starten, niet als complete wedstrijdadministratie.

## Zo werkt het

1. **Open de [webapp](https://hound83.github.io/padel-toss-kotc-americano/)** en kies een speelvorm.
2. **Stel je avond in:** kies het aantal banen. Toss en Gesplitste Toss starten met 8 spelers per baan (Gesplitste Toss gelijk verdeeld over Zilver en Goud), Americano en KOC met 4 spelers per baan. Je kunt de aantallen met de tellers aanpassen.
3. **Vul de namen in** of klik op **📋 Namenlijst plakken**. Plak één naam per regel in het tijdelijke zijpaneel; lege regels worden overgeslagen. Genereer daarna de indeling.
4. **Speel!** Bekijk het schema, houd bij Americano de scores bij of gebruik de presentatiemodus om de indeling duidelijk te tonen.

### Handig tijdens de toss

- **Namen aanpassen:** ook wanneer de groep op het laatste moment verandert.
- **Namenlijst plakken:** beschikbaar bij Toss, Gesplitste Toss (afzonderlijk per Zilver/Goud/Platina), Americano en KOC. Een tijdelijk paneel rechts laat je de lijst corrigeren, het aantal spelers of banen na bevestiging aanpassen en dubbele namen vóór overnemen oplossen. Sluiten of Escape laat alle bestaande spelersvelden ongemoeid; na overnemen kun je **Ongedaan maken** gebruiken. In **Spelers wijzigen** kun je via hetzelfde paneel meerdere *nieuwe* spelers toevoegen zonder bestaande resultaten te overschrijven.
- **Schema bewaren en terughalen:** je kunt je speelschema opslaan als bestand en later weer laden.
- **Automatisch hervatten:** de app onthoudt je sessie in dezelfde browser.
- **Presentatiemodus:** toon de indeling overzichtelijk op een groter scherm.
- **Nederlands en Engels:** wissel op elk scherm via de taalkeuze rechtsboven.

### Geïllustreerde speelvormkeuze (v2.3)

Het startscherm gebruikt marineblauw en limegroen en toont vier getekende baanillustraties. Na het kiezen blijft dezelfde illustratie klein naast de gekozen speelvorm staan. De Americano-afbeelding toont **26–6**: een puntenscore van samen 32 punten, zonder kloknotatie. Dit is uitsluitend een illustratie; de bestaande score-invoer en klassementberekening veranderen niet.

Alle afbeeldingen gebruiken dezelfde geometrisch opgebouwde basisbaan: 20 × 10 meter, servicelijnen op 6,95 meter van het net, middenservicelijn met 20 centimeter uitloop, glazen achterwanden en zijretours, centraal hekwerk en toegang naast het net. De bron staat in `scripts/build-mode-art.cjs`; opnieuw genereren kan met `node scripts/build-mode-art.cjs`. De lichte SVG-bestanden en de nieuwe stylesheet worden samen met de app offline opgeslagen. Er worden geen externe afbeeldingen of lettertypen geladen.

De baanopbouw volgt de [FIP Rules of Padel, editie 2026](https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel-1.pdf), onderdelen Dimensions, Enclosures en Access. De browserchecks bewaren desktop- en mobiele schermafbeeldingen; na een merge controleert CI ook de werkelijk gepubliceerde website, inclusief de nieuwe illustraties en offline laden.

### Live-presentatiemodus

De presentatiemodus is een afzonderlijke liveweergave, niet het hele lange schema:

- **KOC:** uitsluitend de startindeling per baan, zonder invoervelden of speelvormkeuze.
- **Toss:** huidige ronde en volgende ronde; gebruik **vorige/volgende** om door te schuiven (er zijn geen uitslagen om automatisch af te leiden wanneer een ronde klaar is).
- **Americano:** huidige wedstrijden, volgende ronde en het klassement. De actieve ronde schuift automatisch vooruit zodra alle uitslagen van die ronde compleet zijn. Met de pijlen kun je tijdelijk een andere ronde tonen en daarna **Auto** hervatten.
- **Gesplitste Toss:** de huidige en volgende ronde van alle niveaus. Automatisch doorschuiven kan alleen wanneer alle actieve niveaus resultaten bijhouden; anders gebruik je de pijlen.
- **Goud/Zilver na de Americano-kwalificatie:** elke groep krijgt een nieuw klassement vanaf nul. De kwalificatieresultaten blijven beschikbaar als historie. Een latere scorecorrectie verandert nooit automatisch de al vastgestelde samenstelling van Goud en Zilver.

De live-rondekeuze wordt samen met het schema opgeslagen. **Volledig schema** brengt je terug naar de beheermodus.

### Speciaal voor KOC

- Kies **1 tot en met 4 banen** met dezelfde knoppen als bij de andere speelvormen, of **5 tot en met 12 banen** via de dropdown.
- Vink afwezige spelers uit of pas namen aan; starten met minder spelers kan ook.
- De eerste speler start op de hoogste baan, de tweede op de baan eronder.
- Zet desgewenst **Instroomspelers indelen** aan. De laatste vier spelers krijgen dan een eigen vinkje; gemarkeerde spelers starten zo laag mogelijk, bij voorkeur op baan 1.
- Bij minder deelnemers blijven vrije plekken op de laagste banen. Daardoor kunnen niet altijd alle gemarkeerde instroomspelers op baan 1 starten.
- Gebruik **🎲 Genereer startindeling** opnieuw om een andere willekeurige indeling te maken.
- Kopieer de indeling eenvoudig voor **WhatsApp**.
- De app verzorgt de **start**. Het doorschuiven na de eerste wedstrijden gebeurt op de baan.

## 📱 Als app gebruiken

De website is het uitgangspunt; je hoeft geen los HTML-bestand te downloaden.

Je kunt de pagina op een geschikt apparaat ook aan je beginscherm toevoegen:

- **Android (Chrome):** open de website en kies via het browsermenu *App installeren* of *Toevoegen aan startscherm*.
- **iPhone/iPad (Safari):** open de website, tik op *Delen* en kies *Zet op beginscherm*.

De app ondersteunt offline gebruik **nadat de benodigde bestanden eerder zijn geladen**. De eerste keer openen vereist een internetverbinding.

## 🔒 Gegevens en privacy

Er is geen account nodig. Ingevoerde spelersnamen en je actuele sessie worden lokaal in je browser bewaard. Een opgeslagen speelschemabestand kun je zelf bewaren of delen. Wis je de browsergegevens, dan kan ook de lokaal bewaarde sessie verdwijnen.

## 🛠️ Over dit project

De Koriander Padel Toss is een statische webapp, gebouwd met **HTML, CSS en JavaScript** en gehost via **GitHub Pages**. Er is geen server of database nodig voor de speelindelingen.

| Bestand | Functie |
| :--- | :--- |
| `index.html` | De volledige webapp en indelingslogica |
| `manifest.webmanifest` | Installeerbare webapp |
| `sw.js` | Offline caching |
| `icon.svg` en `icon-*.png` | App-iconen |
| `tests/koc.test.cjs` | Geautomatiseerde tests voor de KOC-indeling |

KOC-tests uitvoeren met Node.js:

```bash
node --test tests/koc.test.cjs
```

---

<p align="center">
  <strong>Klaar om te spelen?</strong><br />
  <a href="https://hound83.github.io/padel-toss-kotc-americano/"><strong>🎾 Start de Padel Planner</strong></a><br />
  <em>Gemaakt voor gezellige én goed georganiseerde padelavonden.</em>
</p>

