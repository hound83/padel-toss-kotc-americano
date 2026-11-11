# Americano-repetitie met 12 scenario’s

De simulatie gebruikt de planner en klassementberekening van de app. Twee spelers hebben vooraf vastgelegde speelsterktes die overeenkomen met plek 6 en plek 14 in het veld. Voor elk van hen gebruikt de simulatie drie schema’s met vier banen en per schema een gunstige en een ongunstige loting van partners en tegenstanders. De test kiest de indeling op basis van de loting en het aantal gespeelde wedstrijden voordat hij de uitslagen berekent. Elke wedstrijd telt 32 punten met een kleine willekeurige variatie uit een vaste seed.

De referentie is het meest voorkomende aantal wedstrijden in de fase. De pijlen tonen de stap van de lineaire berekening naar het voorstel van de app. Het rangsaldo telt mee als de punten gelijk zijn.

| Speelsterkte | Spelers | Rondes | Loting | Gespeeld/referentie | Ruwe punten | Punten | Rangsaldo | Plek | Groep |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 6 | 24 | 9 | Gunstig | 6/6 | 117 | 117 → 117 | 42 → 29 | 3 → 3 | Goud |
| 6 | 24 | 9 | Ongunstig | 6/6 | 96 | 96 → 96 | 0 → 10 | 13 → 13 | Zilver |
| 14 | 24 | 9 | Gunstig | 6/6 | 97 | 97 → 97 | 2 → -3 | 14 → 14 | Zilver |
| 14 | 24 | 9 | Ongunstig | 6/6 | 84 | 84 → 84 | -24 → -11 | 18 → 18 | Zilver |
| 6 | 24 | 10 | Gunstig | 6/7 | 113 | 132 → 130 | 40 → 22 | 7 → 7 | Goud |
| 6 | 24 | 10 | Ongunstig | 6/7 | 100 | 117 → 117 | 9 → 19 | 10 → 10 | Goud |
| 14 | 24 | 10 | Gunstig | 6/7 | 97 | 113 → 113 | 2 → -7 | 13 → 13 | Zilver |
| 14 | 24 | 10 | Ongunstig | 6/7 | 69 | 81 → 83 | -63 → -35 | 24 → 23 | Zilver |
| 6 | 20 | 8 | Gunstig | 7/6 | 127 | 109 → 109 | 26 → 18 | 6 → 6 | Goud |
| 6 | 20 | 8 | Ongunstig | 7/6 | 111 | 95 → 95 | -2 → 8 | 13 → 13 | Zilver |
| 14 | 20 | 8 | Gunstig | 7/6 | 108 | 93 → 93 | -7 → -9 | 10 → 10 | Goud |
| 14 | 20 | 8 | Ongunstig | 7/6 | 89 | 76 → 76 | -39 → -22 | 18 → 18 | Zilver |

De weging kwam in alle 12 scenario’s door de bestaande voorspeltoets. Het rangsaldo veranderde steeds, de punten veranderden twee keer en de plek veranderde één keer. Geen van de twee gevolgde spelers wisselde van groep. In één 20-spelersscenario wisselden twee andere spelers van groep aan de grens tussen Goud en Zilver.

Met evenveel wedstrijden per speler, zoals bij 24 spelers en 9 rondes, past de weging het rangsaldo aan. De volgorde blijft dan primair bepaald door de behaalde punten. In deze simulatie kon de speler met speelsterkte 6 door een ongunstige loting op plek 13 eindigen, ook na weging. De tabel is een controle met synthetische uitslagen. Een daadwerkelijk toernooi kan laten zien hoe groot dit effect in de praktijk is.

Opnieuw uitvoeren met Bash

```bash
PADEL_REHEARSAL_RESULTS=1 node --test tests/americano-ranking.test.cjs
```

Opnieuw uitvoeren met PowerShell

```powershell
$env:PADEL_REHEARSAL_RESULTS = '1'
node --test tests/americano-ranking.test.cjs
```
