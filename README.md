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
| ⚖️ **Gesplitste Toss** | Deelt spelers in binnen niveaugroepen (**Zilver**, **Goud** en **Platina**), met optionele scores en een klassement per groep. |
| 🏆 **Americano / Competitieve Toss** | Eén groep met een speelschema, scores en een klassement. |
| 👑 **King of the Court (KOC)** | Kies **Startindeling** of **Rondeplanner** met uitslagen en doorschuiven per ronde. |

## Zo werkt het

1. **Open de [webapp](https://hound83.github.io/padel-toss-kotc-americano/)** en kies een speelvorm.
2. **Stel je avond in:** kies 2 tot en met 12 banen. Toss en Gesplitste Toss starten met 8 spelers per baan (Gesplitste Toss gelijk verdeeld over Zilver en Goud), Americano en KOC met 4 spelers per baan. Je kunt de aantallen met de tellers aanpassen.
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

### Americano-klassement (v2.4)

Het klassement scrolt in een eigen paneel. Klik op een speler om te zien hoe de werkelijk behaalde punten en het saldo leiden tot het puntentotaal en het rangsaldo.

De volgorde is punten, rangsaldo en bij een gelijke stand tussen twee spelers het onderlinge puntenverschil. Bij drie of meer spelers met dezelfde punten en hetzelfde rangsaldo blijft de plaats gedeeld. Als die plaats op de grens tussen Goud en Zilver valt, loot de planner eenmalig onder de gelijk geëindigde spelers voor de resterende plekken in Goud. De uitslag van de loting staat bij de overgang naar Goud en Zilver en wordt bewaard met het schema.

Met **Bekijk de voorgestelde splitsing** vergelijk je de lineaire indeling met het voorstel. Je ziet wie rond de grens staat, waar de weging verschil maakt en hoeveel plekken eventueel worden verloot. Je kunt alle spelers tonen of terug naar de uitslagen. De definitieve indeling en eventuele loting volgen bij **Splitsing bevestigen**.

De planner schat spelerssterkte per fase uit de volledig ingevulde potjes, met beide teams in de berekening. De correctie telt mee als voorspellingen voor weggelaten rondes minstens 5% minder gemiddelde absolute fout hebben dan zowel het spelersgemiddelde als een gelijkspel. Bij onvoldoende gegevens blijft de gebruikelijke evenredige omrekening gelden.

Na afloop van een fase kan een deelnemer die door de loting minder potjes kreeg een geschatte uitslag krijgen tegen een gemiddeld duo met een gemiddelde partner. Punten en saldo volgen uit diezelfde uitslag. De spreiding onder de spelersnaam simuleert mogelijke scores op basis van voorspelfouten uit weggelaten rondes. De vaste schatting bepaalt het klassement.

### Oefenmodus

Open de [oefenmodus](https://hound83.github.io/padel-toss-kotc-americano/?rehearsal=1) om in een schema met score-invoer de volgende open ronde of alle open scores automatisch te vullen. De oefensessie wordt apart bewaard in dezelfde browser. Open de [gewone planner](https://hound83.github.io/padel-toss-kotc-americano/) om je echte wedstrijdsessie te hervatten.

De [Americano-repetitie](docs/americano-rehearsal.md) toont de gevolgen voor punten, rangsaldo, plek en groepsindeling in 12 gesimuleerde scenario’s.

### Live-presentatiemodus

De presentatiemodus is een afzonderlijke liveweergave, niet het hele lange schema:

- **KOC:** toon de startindeling of speel de actuele ronde met uitslagen en nieuwe koppels in de Rondeplanner.
- **Toss:** huidige ronde en volgende ronde; gebruik **vorige/volgende** om door te schuiven (er zijn geen uitslagen om automatisch af te leiden wanneer een ronde klaar is).
- **Americano:** huidige wedstrijden, volgende ronde en het klassement. De actieve ronde schuift automatisch vooruit zodra alle uitslagen van die ronde compleet zijn. Met de pijlen kun je tijdelijk een andere ronde tonen en daarna **Auto** hervatten.
- **Gesplitste Toss:** de huidige en volgende ronde van alle niveaus. Automatisch doorschuiven kan alleen wanneer alle actieve niveaus resultaten bijhouden; anders gebruik je de pijlen.
- **Goud/Zilver na de Americano-kwalificatie:** elke groep krijgt een nieuw klassement vanaf nul. De kwalificatieresultaten blijven beschikbaar als historie. Een latere scorecorrectie verandert nooit automatisch de al vastgestelde samenstelling van Goud en Zilver.

Dezelfde rondeknoppen staan boven het gewone schema en blijven in beeld tijdens het scrollen. Met de pijlen of **Auto** spring je naar de gekozen ronde. **Volledig schema** brengt je vanuit de presentatiemodus terug naar die ronde. De rondekeuze wordt samen met het schema opgeslagen.

Als de baanindeling groter is dan het scherm, verdeelt de presentatie de kaarten over meerdere schermen. Ze wisselen elke 12 seconden. Met de schermpijlen blader je zelf en met **Pauze** zet je het wisselen stil. Tijdens score-invoer blijft het actieve scherm in beeld.

### Rondeklok en speelregels

- Kies bij Toss, Gesplitste Toss en Americano tussen elk punt tellen en padeltelling in games. Gewone Toss gebruikt die keuze in **Hoe speel je dit?**. Scorevelden bij Americano en bij groepen met uitslagen tonen de gekozen eenheid.
- Open **Speelverdeling bekijken** boven het schema voor het aantal wedstrijden per speler, opeenvolgende rustbeurten en terugkerende duo’s.
- Zet **Rondeklok gebruiken** aan en kies de standaard speeltijd en optioneel de wisseltijd. Start elke klok handmatig. De ring loopt terug met de resterende tijd. Op nul kleurt het klokpaneel rood en verschijnt **Tijd om**. Tijdens het lopen kun je één minuut aftrekken of bijtellen. Reset zet de tijd terug op de begintijd van die ronde. De volgende ronde begint met de standaardduur en een stilstaande klok.

## Speciaal voor KOC

- Kies **2 tot en met 4 banen** met dezelfde knoppen als bij de andere speelvormen, of **5 tot en met 12 banen** via de dropdown.
- Vink afwezige spelers uit of pas namen aan; starten met minder spelers kan ook.
- De eerste speler start op de hoogste baan, de tweede op de baan eronder.
- Zet desgewenst **Indelen op laagste baan** aan. De laatste vier baanplekken krijgen dan een vinkje. Gemarkeerde spelers beginnen zo laag mogelijk. Bij vier banen zijn dit spelers 13–16.
- Schakel **Met twee wachtspelers** in om twee extra spelers toe te voegen. Bij volle bezetting wachten de laatste twee spelers de eerste ronde. Bij vier banen zijn dit spelers 17 en 18. Na elke ronde wisselt het verliezende duo van baan 1 met het wachtende duo. De startindeling, presentatie en WhatsApp-tekst tonen het wachtduo en de wisselregel.
- Bij minder deelnemers blijven vrije plekken op de laagste banen. Daardoor kunnen niet altijd alle gemarkeerde spelers op baan 1 starten.
- Gebruik **🎲 Genereer startindeling** opnieuw om een andere willekeurige indeling te maken.
- Kopieer de indeling eenvoudig voor **WhatsApp**.
- Bij **Startindeling** loot je de beginbanen en schuiven de spelers daarna zelf door.
- In **Rondeplanner** voer je de eindstand per baan in. De planner schuift winnaars en verliezers door, wisselt bij baan 1 met het wachtduo als dat meedoet en maakt nieuwe koppels. Hij gebruikt de uitslagen van die sessie om gelijkwaardige potjes te bevorderen en recente partners minder vaak samen te zetten.
- Beide KOC-varianten tellen ieder punt door. **Hoe speel je dit?** legt de Spaanse toss, de servicevolgorde en het beslissende punt bij gelijkspel uit.

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

