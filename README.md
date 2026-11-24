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

- Bij gewone Toss spreken spelers de telling zelf af. De gebruikelijke padeltelling is een optie. Gesplitste Toss en Americano bieden een instelling voor de score-invoer. Het schema toont de gekozen eenheid bij wedstrijden met score-invoer.
- Open **Speelverdeling bekijken** boven het schema voor het aantal wedstrijden per speler, opeenvolgende rustbeurten en terugkerende duo’s.
- Zet de **Rondeklok** aan en kies de rondeduur. Een nieuwe KOC-klok staat op 20 minuten. Start elke klok handmatig. De ring loopt terug met de resterende tijd. In de KOC-presentatie staat de klok rechts onder de kop, boven de banen. Op smalle schermen neemt hij daar de beschikbare breedte in. Op nul kleurt het klokpaneel rood en verschijnt **Tijd om**. Tijdens het lopen kun je één minuut aftrekken of bijtellen. Reset zet de tijd terug op de begintijd van die ronde. De volgende ronde begint met de standaardduur en een stilstaande klok.

## Extra instellingen en speelschema

Bij Toss, Gesplitste Toss en Americano staat **Extra instellingen** onder de namen. Kies eventueel een begintijd, rondeduur (standaard 20 minuten) en namen of nummers voor de banen. Bij Gesplitste Toss gelden de spelerskeuzes per groep.

**Start** garandeert een speelplek in ronde 1. Een bevestigd duo speelt de eerste ronde samen. Daarna probeert de planner beide spelers in dezelfde rondes te laten spelen en rusten. Met **Laatste vrij** krijgt een speler zo mogelijk rust in de laatste ronde. Banen vullen en twee opeenvolgende wachtrondes voorkomen gaan voor. Een optioneel speelniveau helpt de planner om evenwichtige koppels te kiezen. De organisator ziet de aanduidingen in de instellingen.

**Opnieuw loten** maakt vanaf het schemablad een nieuwe indeling. Eerdere rondes en rondes tot en met de laatste ingevoerde uitslag blijven behouden, ook bij een gedeeltelijke score. De bestaande groepstoewijzing blijft gelden na een Americano-splitsing.

**Schema afdrukken** opent het afdrukvenster. **PDF downloaden** slaat rechtstreeks een A4-bestand op. Beide bevatten de ronde, eventuele tijden, baanaanduidingen, spelers, ingevulde scores en rustbeurten. Een complete ronde blijft waar mogelijk op één pagina. Lange rondes krijgen een herhaalde rondekop. Beide acties werken ook offline.

Bij KOC zijn baanaanduidingen en speelniveau beschikbaar onder **Extra instellingen**. De Rondeplanner gebruikt het niveau bij de start en vermindert het gewicht ervan in de eerste zes gespeelde wedstrijden.

## Speciaal voor KOC

- Kies **2 tot en met 4 banen** met dezelfde knoppen als bij de andere speelvormen, of **5 tot en met 12 banen** via de dropdown.
- Vink afwezige spelers uit of pas namen aan; starten met minder spelers kan ook.
- De eerste speler start op de hoogste baan, de tweede op de baan eronder.
- Kies **Baan 1** bij de gewenste spelers in de laatste vier baanplekken. Gemarkeerde spelers beginnen zo laag mogelijk. Bij vier banen zijn dit spelers 13–16.
- Klik op **Wachtduo toevoegen** naast **Namenlijst plakken** om twee extra spelers toe te voegen. Bij volle bezetting wachten de laatste twee spelers de eerste ronde. Bij vier banen zijn dit spelers 17 en 18. Na elke ronde wisselt het verliezende duo van baan 1 met het wachtende duo. De startindeling, presentatie en WhatsApp-tekst tonen het wachtduo en de wisselregel.
- Bij minder deelnemers blijven vrije plekken op de laagste banen. Daardoor kunnen niet altijd alle gemarkeerde spelers op baan 1 starten.
- Gebruik **🎲 Genereer startindeling** opnieuw om een andere willekeurige indeling te maken.
- Kopieer de indeling eenvoudig voor **WhatsApp**.
- Bij **Startindeling** loot je de beginbanen en schuiven de spelers daarna zelf door.
- In **Rondeplanner** voer je de eindstand per baan in. De planner schuift winnaars en verliezers door, wisselt bij baan 1 met het wachtduo als dat meedoet en maakt nieuwe koppels. Bij **Vrij met balans** kiest de planner uit alle koppelcombinaties en probeert hij recente partners te spreiden. Bij **Gekruist met balans** splitst hij de twee duo’s die na het doorschuiven op dezelfde baan aankomen. Hij kiest met de uitslagen welke kruising de beste balans geeft. Twee aangevinkte spelers die op baan 1 starten krijgen een tijdelijke hint voor de koppelkeuze. Die loopt af over zes gespeelde wedstrijden.
- Beide KOC-varianten tellen ieder punt door. De speluitleg voor King of the Court legt de Spaanse toss, de servicevolgorde en het beslissende punt bij gelijkspel uit.

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


## Preview 3.0

De standaardlink opent 2.8.0. Onderaan staat **Probeer de 3.0-preview**. De preview bewaart de lokale sessie apart. Een bestaand schema kan via de JSON-export van 2.8.0 worden ingeladen.

Kies na het indelen **Schema delen → Kijklink maken**. Iedereen met de volledige link kan het schema, de rustbeurten en eventuele uitslagen en klassementen bekijken en op speler filteren. De link bevat de eerste gedeelde indeling. Wie de link doorstuurt, deelt die indeling ook.

De organisator houdt het bewerken op het eigen apparaat. Zolang de planner open is, verstuurt hij wijzigingen versleuteld en ondertekend via ntfy.sh. De dienst bewaart updates tijdelijk. Met **Schema delen → Kijksessie beëindigen** verstuurt de organisator de eindstand. Kijkers zien dat de sessie is gesloten. Hun browser bewaart de ontvangen eindstand voor een volgend bezoek. Wie de link pas opent nadat de dienst de updates heeft verwijderd, ziet de oorspronkelijke indeling. Een kijklink verleent geen schrijfrechten.

## Centraal beheer

Open **Beheer** onderaan de site of ga naar [Centraal beheer](https://padel.hound83.workers.dev/beheer). Na één keer inloggen zie je de aanmeldavonden van vandaag, komende en recente avonden, en losse online speelschema’s. Klap een avond open om spelers te verplaatsen, af te melden of toe te voegen. Vanuit dezelfde kaart kun je de groepslink kopiëren, indelen en een gepubliceerd schema openen. **Nieuwe avond** gebruikt dezelfde beheerdersinlog.

Het vaste wachtwoord staat in de Cloudflare Worker `padel` als runtime-Secret `PADEL_ADMIN_PASSWORD`. Stel het in via **Settings → Variables and Secrets**. Een wijziging maakt bestaande centrale inlogs ongeldig. Elke inlog vervalt na twaalf uur. Voor een eigen Node-host kan dezelfde omgevingsvariabele worden ingesteld.

## Versie 3.2 met aanmeldpoll

Op de [sessiesite](https://padel.hound83.workers.dev/) opent **Aanmeldpoll maken** een avond met een speelvorm, datum, tijden, banen en capaciteit. Kies een eigen beheerwachtwoord (minimaal acht tekens) en deel de **groepslink** via WhatsApp. Iedereen met die link ziet tijdens de open aanmelding de lijst. Spelers hebben geen account nodig. Ze kunnen op dezelfde browser hun eigen reactie wijzigen of intrekken. Bij een ander apparaat of gewiste browsergegevens kan de organisator helpen.

De eerste **Ja**-aanmeldingen vullen de plekken. De overige **Ja**-reacties komen op de wachtlijst, op tijdstip van aanmelding bij die groep. Bij een vrijgekomen plek schuift eerst de wachtlijst door en vervolgens de eerste beschikbare expliciete reserve. Een bewuste reserve blijft tot een afmelding of een beheerbesluit op de reservelijst. Opnieuw aansluiten bij een groep geeft een nieuwe plek achteraan.

Open **Beheer** met het wachtwoord. Voeg een speler toe of kies bij een naam **Wijzig** voor naam, lijst en exacte positie. Op een computer kan ook worden gesleept. **Alleen na akkoord** houdt iemand buiten de automatische indeling. Dat oordeel is alleen voor beheerders zichtbaar. De beheerder kan het voor dezelfde speelvorm in toekomstige edities bewaren, een naamgenoot beoordelen en voor één avond afwijken.

**Ga indelen** sluit de aanmelding en verbergt de lijsten voor bezoekers. De bestaande planner opent met de bevestigde deelnemers. Bij Gesplitste Toss kun je de speelgroep vooraf kiezen. **Publiceer op de aanmeldlink** maakt het speelschema bereikbaar vanaf dezelfde groepslink. Beheer van een al gepubliceerd speelschema verloopt via **Open planner**. **Herhaal volgende week** neemt de instellingen en het wachtwoord mee naar een verse aanmeldlijst. Een openbare poll vervalt veertien dagen na de speeldatum of laatste wijziging, afhankelijk van welke later is. Online speelsessies hebben hun eigen bewaartermijn.

## Versie 3.1 met gedeelde score-invoer

Open de [Koriander-sessiesite](https://padel.hound83.workers.dev/), maak een indeling en kies **Schema delen** en **Sessie online zetten**. Kopieer **Beheerlink** naar je eigen telefoon. Zodra de sessie online staat kan de laptop dicht. Op de telefoon staan dezelfde banen, rondes, scorevelden, timer en deelknoppen. Met de beheerlink kan iedereen de sessie beheren, dus deel deze alleen met een medeorganisator die dit ook mag.

De kijklink en invullinks hebben de vorm `/s/7KDM-P4WX`. Hoofdletters en het streepje zijn optioneel. Bij Americano, scoregroepen van de Gesplitste Toss en de KOC-rondeplanner kan de organisator kiezen voor één invullink voor de hele groep of een link per speler. Met de groepslink kiest iedere speler zelf een naam. De eerste uitslag telt. De organisator kan deze aanpassen in de planner. Bij een overstap naar een andere invoeroptie vervallen de eerdere invullinks. De kijklink blijft beschikbaar. Gewone Toss en KOC-startindeling hebben alleen een kijklink.

Op een kijk- of invullink wordt de stand direct opgehaald bij openen of terugkomen. Zolang de pagina zichtbaar is, controleert deze iedere 30 seconden op wijzigingen. Bij het versturen van een uitslag krijgt de speler direct een bevestiging.

Zeven dagen na de laatste wijziging verlopen de online links. Bekijken verlengt de termijn niet. Na **Sessie beëindigen** sluit de invoer direct en is de eindstand nog zeven dagen beschikbaar. Verlopen sessies en codes worden elk uur opgeruimd. Een lokale JSON-export blijft bij de organisator.

### Sessiesite draaien

GitHub Pages bedient de statische 2.8- en 3.0-versies. De sessiesite voor 3.1 serveert de planner en de database-API op hetzelfde domein. Een installatie kan meerdere tossavonden bedienen. Namen en sessies gaan pas online bij **Sessie online zetten**.

- Voor Cloudflare Workers en D1 staat de configuratie in `wrangler.jsonc`. Publiceer met een aangemeld Cloudflare-account via `npx wrangler@4 deploy`. Wrangler verpakt de publieke bestanden en koppelt de D1-database. De Worker maakt bij het eerste gebruik de tabellen aan. De Cron Trigger ruimt verlopen gegevens op.
- Op een eigen host met Node.js 22.13 of nieuwer draait `node sessions/local.mjs` dezelfde sessiedienst met SQLite. Geef `SESSION_DB` een pad op permanente opslag. De standaardpoort is 8787. Zet er voor publiek gebruik een HTTPS-proxy voor. De browser maakt de beheerlink en spelerslinks op de publieke hostnaam. Bij gebruik achter een proxy groepeert de Node-server de limiet voor ongeldige codes per direct verbonden IP-adres.
- De server- en browsertests staan in `tests/sessions.test.cjs` en `tests/sessions.browser.test.cjs`. De browsertest gebruikt uitsluitend fictieve spelers en een tijdelijke database.
