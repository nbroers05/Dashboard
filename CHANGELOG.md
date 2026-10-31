# Wijzigingen

Alle versies van het dashboard, nieuwste bovenaan, met terugwerkende kracht aangevuld uit de git-geschiedenis (29 okt 2026).
Tot en met versie 26 was het nummer één getal (`?v=26`); vanaf 0.27.0 is het `0.MINOR.PATCH` (grote opdracht = MINOR, kleine fix = PATCH).
Daarom staan de oude nummers hier als 0.N.0. Nummer 19 en 24 zijn nooit uitgebracht (overgeslagen tijdens het werk).
Onder de lijst staat per ronde de uitgebreide toelichting zoals die toen geschreven is.


## 31 oktober 2026

| Versie | Wat |
|---|---|
| 0.52.2 | Gezondheid: stappen per bron tellen. Sinds 28 okt komen dezelfde stappen via drie bronnen bij Google binnen (Google Health-app, Samsung Health, telefoonsensor) en Google telde ze deels dubbel (30 okt: 24.494 in plaats van 13.701). Nu telt de hoogste bron, ook in het archief (25-30 okt opnieuw opgehaald). |
| 0.52.1 | Instellingen › Data: 'Archief elk uur starten' toont nu de laatste run (ook als een ander dashboard hem startte, eerst stond er dan 'nog niet geprobeerd'); de dashboards wachten 0-5 min zodat ze niet tegelijk starten; de lange Canvas-reden staat nu onder de naam in plaats van eroverheen; uitleg onderaan noemt het inloggen met je wachtwoord. |
| 0.52.0 | Het archief draait weer elk uur: GitHub stelde de geplande run uit tot elke 5-7 uur, nu start je dashboard hem zelf als hij te lang wacht (je archief-token heeft daarvoor het recht 'Actions: Read and write' nodig, README stap 14). Stand in Instellingen › Data. Ook: het vak Berichten laadde soms vóór de archiefverbinding en bleef dan tot een half uur leeg. |
| 0.51.0 | Mensen, fase 2 (alleen GitHub, geen server): Spotify nu en een berichtenvak. Per persoon een eigen privé repo met een eigen token; jouw dashboard schrijft wat je luistert (zolang het ergens open staat) en je ziet berichten in het nieuwe vak Berichten (Meer-balk) en als melding. Instellen in Instellingen › Mensen (README stap 14). |
| 0.50.0 | Mensen, fase 1: Instellingen › Mensen. Per persoon een eigen adres (?thomas) met een eigen wachtwoord, en aanvinken wat die persoon ziet: AH-diensten, uren deze week, colleges en tentamens, laatst gekeken film, weer. Elk uur maakt het archief daar een versleuteld pakketje van; hun pagina toont alleen dat. Werkt pas als het token DASHBOARD_TOKEN in het archief staat (README stap 14). Spotify nu en berichten volgen in fase 2. |
| 0.49.0 | Eén inlog, fase 3: je verjaardag komt nu uit het privé archief, dus na inloggen klopt hij op elke computer. Op een computer waar het hulpprogramma nooit gedraaid heeft (je laptop) zegt het meldingenvak niet meer 'start het hulpprogramma'; mediakaarten van de pc en Wensen waren daar al verborgen. |
| 0.48.0 | Eén inlog, fase 2: Google (agenda, mail, gezondheid) en Spotify kunnen mee in de bundel en vernieuwen zichzelf, zonder hulpprogramma en zonder server. Spotify koppel je één keer op 127.0.0.1:8765/koppel met je Client Secret (README stap 13). Maak daarna de bundel opnieuw. |
| 0.47.0 | Eén inlog, fase 1: inlogscherm met je eigen wachtwoord als deze browser nog niks heeft. Ontgrendelt een versleutelde bundel (vault.json) met voorlopig het archief-token en de Twelve Data-key; Spotify en Google volgen in fase 2. 'Deze computer onthouden' uit = alles weg als je het tabblad sluit. Uitlogknop in de topbalk (alleen na inloggen met het wachtwoord) wist alles. Bundel maken in Instellingen › Inloggen (alleen op je pc, via het hulpprogramma). |
| 0.46.4 | Episodes Left: JoJo (STEEL BALL RUN) kreeg geen cover, omdat AniList titels met een krul-apostrof (’) niet vindt; die wordt nu als gewone ' gezocht. Covers worden één keer opnieuw opgehaald. Ook in het archief krijgt JoJo nu weer het aantal uitgezonden afleveringen. De knop 'Open LiveChart' (zonder gegevens) wijst naar het nieuwe adres van My List. |

## 30 oktober 2026

| Versie | Wat |
|---|---|
| 0.46.3 | Installeerbaar als app op je telefoon (Firefox › ⋮ › Installeren): eigen icoon, opent op Vandaag, snelkoppelingen Check-in en Agenda. Haalt altijd eerst de nieuwste versie; zonder internet de laatst geladen versie met een balkje 'Offline'. Uitleg in README stap 11. Op de pc verandert er niets. |
| 0.46.2 | Zijbalk (alleen liggend): Spelletjes en Focusmodus erbij, de minimaliseerknop is uit de topbalk; klik op het logo linksboven om te minimaliseren (terug via de knop rechtsboven of Esc). |
| 0.46.1 | Minimale modus werkte niet meer op de pc (sinds 0.45.0 werd elk vak een schermvullende laag): bij het weghalen van Indelen was de regel die de vakken verbergt half meegeschrapt. Hersteld; de rest van die wijziging nagelopen, verder niets kapot. |
| 0.46.0 | Groot idee: zijbalk op de pc (alleen liggend scherm). Smalle balk links met logo, Overzicht, Agenda, Mijn data, Feeds en onderaan Instellingen; naam bij hover, actief item met een licht vlakje, rood puntje bij Feeds als er nieuws is sinds je Feeds voor het laatst opende. Agenda opent schermvullend als eigen pagina (#agenda, Esc of terug = dashboard). Feeds, Mijn data en het tandwiel zijn uit de topbalk (in liggend). Meldingen: de knop 'Alle meldingen' staat nu naast het getal en steekt niet meer onder het vak uit. Staand en telefoon ongewijzigd. |
| 0.45.0 | Groot idee: telefoon met tabbalk. Onderaan vaste tabs Vandaag, Agenda, Media en Data. Vandaag: compacte topbalk, dagregel als chips, weer met buienalarm, AH, Canvas, meldingen, to-do en check-in in één scherm (tik = de pop-up van het vak). Agenda: lijst per dag met dagstrip, aftellen bij een deadline en regencheck onder AH-diensten; Week = de gewone weekweergave. Media: compacte speler, filterchips, film/Laatst gekeken, Episodes, F1, vrienden. Data: check-in invullen, kerncijfers, plek voor Memory Lane, gezondheid. Minispeler boven de tabbalk. Terug-knop gaat naar het vorige tabblad. "Indelen" is helemaal weg (code en bewaarde volgorde). Pc-indelingen ongewijzigd. |
| 0.44.18 | Persoonlijke gegevens uit de publieke repo: AH-loon (uurloon, toeslagen, percentages) staat nu in het privé data-archief en het AH-vak leest het met het archief-token. Zonder token zie je wel je uren, en bij het salaris een knop 'archief koppelen voor €'. CLAUDE.md zonder loon, loonstrookbedragen, leeftijd, contracturen en aantal banktransacties (die staan in de CLAUDE.md van het archief). |
| 0.44.17 | Check-invak (pc, staand, liggend, telefoon) is alleen nog om in te vullen: geen laatste waarden of Data-knop meer, alleen hoeveel check-ins je vandaag hebt gedaan. De browser bewaart ook alleen nog tijd en id. |
| 0.44.16 | Schreefcijfers: de grote hoofdgetallen (temperatuur, AH-uren en salaris, stappen/slaap, F1-aftelklok, filmcijfers, tellers) in Source Serif 4 met rechte cijfers; labels blijven schreefloos. Schakelaar in Instellingen › Thema › Lettertype, standaard aan. |
| 0.44.15 | Gezondheid: stappen als grote ring rond het percentage van je dagdoel (vakkleur), met stappen en slaap ernaast. Klik op 'doel 10.000' om het doel te wijzigen (bewaard in deze browser); slaapfases en hartslag eronder. |
| 0.44.14 | Zoekbalk: een link of webadres (https://…, nu.nl, github.com/…) gaat bij Enter meteen naar die pagina in plaats van een Google-zoekopdracht. |
| 0.44.13 | Knop voor het oude staande ontwerp weggehaald; staand is altijd het nieuwe ontwerp (ook als je eerder "oud" had gekozen). |
| 0.44.12 | Pc-data gecontroleerd: ActivityWatch, Firefox en aan/uit komen elke dag binnen. Data-overzicht toont nu ook "Pc: aan/uit" en "Firefox-geschiedenis" (in het archief telden ze nog niet mee). |
| 0.44.11 | Songtekst: de laatste letter van een lange regel valt niet meer weg (de huidige regel wordt 4% groter; daar is nu ruimte voor). |
| 0.44.10 | Instellingen › Data: overzicht van de bronnen van het data-archief (zat alleen nog in het check-in-vak, dat in de Meer-lade verstopt zit) plus alle koppelingen en sleutels op één plek. |
| 0.44.9 | Songtekst loopt niet meer achter bij het eerste nummer: de Spotify-positie wordt gerekend vanaf het moment dat Spotify hem gaf (midden van het verzoek) en na een nieuw nummer of start twee keer snel bijgesteld. |
| 0.44.8 | Seizoenseffecten ook in de minimale modus (nieuwe tab): vallende sneeuw, blaadjes enz.; de topbalk is daar dan doorzichtiger zodat je ze ziet. |
| 0.44.7 | Tentamenweek herkent ook Engelse namen in je agenda (exam, resit, retake, midterm, finals); het archief heeft nu een eigen soort 'tentamen' en Tentamens bij Mijn data. |

## 29 oktober 2026

| Versie | Wat |
|---|---|
| 0.44.6 | Mijn data zonder gaten: masonry-indeling over de volle breedte (2400 breed 4 kolommen, 1350 staand 2, telefoon 1), Dekking en Overlap over de hele breedte, vakken zo verdeeld dat de kolommen gelijk eindigen; wat er onderaan nog over is krijgen de grafieken erbij in hoogte. Opnieuw bij periode, tabjes en andere breedte. |
| 0.44.5 | Minimale modus (?mini=1) gecontroleerd: alleen topbalk-versiering, groet en achtergrond, bij uitklappen komt de rest erbij. Themabestanden krijgen één herkansing als laden mislukt. CLAUDE.md bijgewerkt (settings.js, themes.js, themes/). |
| 0.44.4 | Alle overige thema's: Winter (rijp langs de vakken, sneeuwkapjes 1-26 dec, adem-wolkje bij het weer onder 3°), Lente (bloesem, vallende bloesem), Zomer (gloed + zonnestralen achter de topbalk), Sinterklaas (15 nov-5 dec, pepernoten, slinger, cadeautje), Kerst (15-26 dec, sneeuwkapjes, knipperende lampjes, sneeuw), Oud en Nieuw (27 dec-1 jan, sterrenhemel, aftellen op 31 dec, vuurwerk om 00:00 en op 1 jan), Valentijn, Pasen (eitjes), Koningsdag en Bevrijdingsdag (vlaggetjes), verjaardag met slinger, F1-raceweekend (finishvlag-rand om het F1-vak, uit het bewaarde F1-schema), Tentamenweek (uit je agenda, alles stil). Topbalkversiering wordt kleiner als er weinig ruimte boven de topbalk is. Echt weer: sneeuw/regen als deeltjes, druppels op de topbalk, zon als gloed. |
| 0.44.3 | Tabje Thema: Automatisch met "nu: …"-regel (wat het nu is en wat er daarna komt), alle thema's als kaartjes met voorvertoning (klik = vast), schakelaars voor deeltjes, vakversiering, topbalk-versiering, achtergrond, echt weer, eenmalige effecten en een hoofdschakelaar, Rustig/Normaal/Feestje, Bekijk als datum + terug naar vandaag. |
| 0.44.2 | Instellingen: tandwiel in de topbalk (naast minimaliseren) opent een paneel met tabjes (settings.js; nu alleen Thema, later makkelijk meer); Esc of klik ernaast sluit, op de telefoon schermvullend. Versiering liever op vakken die je ziet (niet in de dichte Meer-lade). |
| 0.44.1 | Halloween (24-31 okt) en Herfst helemaal af: spinnenweb in een hoek van een paar vakken, spinnetje dat één keer aan een draadje zakt, oranje/paarse lampjes boven de topbalk, pompoen in de dagregel, "Halloween over n dagen"; herfst: warme achtergrond, blaadje op een hoek van een paar vakken, af en toe een vallend blad (achter de vakken). Versiering komt alleen waar geen tekst, knop of plaatje staat. |
| 0.44.0 | Nieuw themasysteem (stap 1): themes.js kiest het thema, elk thema een eigen bestand in themes/. Topbalkkleur, groeten, verjaardag (?mijnverjaardag) en confetti/vuurwerk werken zoals in 0.42.0, nu via het nieuwe systeem; ?datum=, ?thema= en ?<thema> blijven werken. |
| 0.43.8 | Hoger/lager "Gemiddelde" gebruikt nu het echte Letterboxd-gemiddelde (1.859 films, uit het Sterrenvoorspeller-bestand in het privé archief), ook voor films van je watchlist; zonder token TMDB. |
| 0.43.7 | Hoger/lager ook op het gemiddelde van TMDB-gebruikers (Letterboxd heeft geen openbare API), met eigen record. |
| 0.43.6 | Check-in-vak telt uit het archief (alle apparaten, deze en vorige maand, elke 10 min) plus de wachtrij. |
| 0.43.5 | Minder lege ruimte: Canvas op inhoudshoogte (liggend), grotere filmposters en artiesten als rij foto's in het roterende vak, weinig series = grotere covers, Mijn data-vakken op inhoudshoogte, Spelletjes breder met grotere posters. |
| 0.43.4 | 2048 met vierkante vakjes en schuivende tegels (samenvoegen ploppen, nieuwe tegel groeit), uit bij beweging beperken. |
| 0.43.3 | Hoger/lager: groene gloed om het vak bij goed, rode bij fout. |
| 0.43.2 | Pijltjes van het roterende vak onderaan naast de bolletjes, niet meer over de inhoud. |
| 0.43.1 | Aftellen naar je eigen verjaardag weer in de dagregel ('nog 6 dagen tot je verjaardag'). |
| 0.43.0 | Spelletjes-pagina (icoon in de topbalk, #games): Hoger/lager met je Letterboxd-cijfers, Raad de poster, 2048; records alleen in de browser. |
| 0.42.0 | Feestdagen- en verjaardagsversie van de topbalk (themakleur + groet, confetti op je verjaardag, vuurwerk op oudjaar, 1x per dag); testen met ?datum=JJJJ-MM-DD of ?<feestdag>; eigen verjaardag via ?mijnverjaardag= alleen in de browser. |
| 0.41.0 | Vak Wensen (WENSEN.md als lijst, alleen lezen, alleen op de pc via het hulpprogramma /wensen); Meer-lade past zich aan het aantal vakken aan. |
| 0.40.10 | ?maat toont de echte venstermaat (breedte × hoogte, schaal, staand/liggend) om op precies die maat te testen. |
| 0.40.9 | Mediakaarten knipperen niet meer als er niets speelt (pas weg na 6 s zonder signaal van Spotify of Windows). |
| 0.40.8 | Pijltjes links/rechts in het roterende vak; versie in de Meer-balk (verticaal gecentreerd) en Meer-balk met meer contrast boven de agenda. |
| 0.40.7 | Pijltjes bij Dekking per bron om een maand terug of vooruit te gaan. |
| 0.40.6 | Kaart zonder Leaflet-vlaggetje in de bronvermelding. |
| 0.40.5 | Heatmap bij Plekken duidelijker (logaritmisch, geel naar oranjerood, kaart donkerder en grijzer). |
| 0.40.4 | Mijn data: 'Deze maand' (vanaf de 1e) in plaats van 'Afgelopen maand'. |
| 0.40.3 | Nachtstand (avondmodus) weggehaald. |
| 0.40.2 | Agenda F1-sessies FP1-3 en Quali in plaats van VT en Kwali. |
| 0.40.1 | F1-uitslag nog maar 3 dagen, daarna aftellen naar de volgende GP. |
| 0.40.0 | Mijn data toont de nieuwe archiefbronnen (dekking, tabje Series, Firefox en opstarten bij Computer, kalender/maan/berichten in Overlap); lege dag = 0 alleen binnen de periode van die metriek. |
| 0.39.0 | Episodes Left-logboek naar het privé archief (per serie nog open, uitgezonden via AniList, gekeken), max. elk half uur bij een verandering; DASH_DATA.appendRows. |
| 0.38.0 | Pagina Mijn data (grafiek-icoon in de topbalk, #mydata): dekking per bron, periodefilter, kijken/luisteren, plekken (Leaflet + OSM), werk, geld, lichaam, computer, check-ins en overlap met correlatie. Data komt alleen uit de privé repo via het token; zonder token uitleg, ?demo = verzonnen cijfers. |
| 0.37.1 | Hulpprogramma telt telefoonmeldingen (tijd + app, geen inhoud) voor het privé archief; docs. Wensenlijst-afspraak in CLAUDE.md; .obsidian en wensen/ in .gitignore. |
| 0.37.0 | Data-overzicht (status van het privé archief, waarschuwing bij een stille bron). |
| 0.36.0 | Check-in-vak (stemming, energie, focus, stress) dat opslaat in de privé data-repo. |

## 28 oktober 2026

| Versie | Wat |
|---|---|
| 0.35.2 | YouTube-kanaal van Ken (@kenforrest) op de Feeds-pagina. |
| 0.35.1 | NU.nl, The Yard, ASML en Apple, Canvas-link EUR; ntfy uit de focusmodus. |
| 0.35.0 | Filmnieuws (Letterboxd Journal) in plaats van Reddit op de Feeds-pagina. |
| 0.34.0 | Opruimen en controleren (posters in liggende tabjes, F1-uitslag compact), CLAUDE.md en CHANGELOG.md. |
| 0.33.0 | Feeds-pagina (nieuws, Reddit, YouTube via de Action; markten in de browser). |
| 0.32.0 | Focusmodus (studietimer, playlist, meldingen gedempt, ntfy) en verjaardagen in de dagregel. |
| 0.31.0 | Spotify-maandoverzicht (top 5 nummers en artiesten, scope user-top-read). |
| 0.30.0 | F1-vak toont na de race de uitslag en het klassement tot de volgende sessie. |
| 0.29.0 | Draait nu in de bios (LantarenVenster via de Action; Pathé en KINO overgeslagen, zie cinema.py). |
| 0.28.0 | Letterboxd van vrienden (Action schrijft data/friends.json, vak Vrienden met je verwachte cijfer). |
| 0.27.1 | Snelkoppelingen ingeklapt op het staande scherm, uitvouwen naar links bij hover. |
| 0.27.0 | Eigen logo, vaste spelerknoppen, roterend vak voller, dagregel en nachtstand. |
| 0.26.0 (toen `?v=26`) | Buienalarm in het weervak weer volledig, compacter met de bron naast de zin. |
| 0.25.0 (toen `?v=25`) | Agenda ma-zo met weeknavigatie en Passend/Scrollen; snelkoppelingen zonder letters. |
| 0.23.0 (toen `?v=23`) | Nieuw staand ontwerp (anderhalve schermhoogte), oud blijft via de knop. |
| 0.22.0 (toen `?v=22`) | Brede indeling: AH-staafjes vullen de vrije ruimte, urengetallen terug. |
| 0.21.0 (toen `?v=21`) | Brede indeling: F1-circuit past in het vak, filmposter vult de hoogte. |
| 0.20.0 (toen `?v=20`) | Breed liggend scherm: alles in één scherm, drie kolommen. |
| 0.18.0 (toen `?v=18`) | Mediastapel: ook terug naar Spotify door te klikken, eigen keuze blijft staan. |
| 0.17.0 (toen `?v=17`) | Mediastapel: alles wat afspeelt, in Now Bar-stijl. |
| 0.16.0 (toen `?v=16`) | ?mini=1 voor de nieuwe-tabpagina: minimaal, autofocus, zware vakken pas bij uitklappen. |

## 27 oktober 2026

| Versie | Wat |
|---|---|
| 0.15.0 (toen `?v=15`) | Google-tokens via het hulpprogramma: geen Vernieuwen meer op de pc. Privacyverklaring voor het Google-inlogscherm. Google Search Console-verificatie voor het OAuth-inlogscherm. |
| 0.14.0 (toen `?v=14`) | Google Health: eigen token zonder agenda/Gmail-scopes, volledige foutmelding. |
| 0.13.0 (toen `?v=13`) | Fase 8: gezondheid via de Google Health API. |
| 0.12.0 (toen `?v=12`) | Versienummer onderaan het dashboard. |
| 0.11.0 (toen `?v=11`) | AH-loon: tweede loonstrook, zondag/feestdag-toeslag, WUK. |
| 0.10.0 (toen `?v=10`) | AH-loon: getallen van de loonstrook, vakantietoeslag en uitbetaalde uren per periode. |
| 0.9.0 (toen `?v=9`) | Fase 7: AH-loon met toeslagen per tijdvak en netto-schatting. |
| 0.8.0 (toen `?v=8`) | Fase 6: meldingenvak, telefoonmeldingen via hulpprogramma, Gmail. |
| 0.7.0 (toen `?v=7`) | Fase 5: Laatst gekeken via Letterboxd-Action. Letterboxd-Action: checkout@v5 (Node 24). |
| 0.6.0 (toen `?v=6`) | Fase 4: Canvas-deadlines op urgentie met eigen pagina. |
| 0.5.0 (toen `?v=5`) | Bewegende weericonen terug, animaties wat langzamer. |
| 0.4.0 (toen `?v=4`) | Fase 3: subtiele animaties, stilstaande weericonen. |
| 0.3.0 (toen `?v=3`) | Versienummer achter scripts en stylesheet tegen oude bestanden uit de cache. |

## Vóór het versienummer (27 oktober 2026)

- Add CLAUDE.md with project overview for new sessions.
- Fase 1: topbalk met klok, snelkoppelingen, zoekbalk en minimale modus.
- Fase 2: weer-popup, buienalarm via Buienradar, eigen snelkoppelingen.
- Eerste bestanden met de hand geüpload naar GitHub.

---

# Toelichting per ronde

## 0.36.0 – 0.37.1 (29 oktober 2026): privé data-archief

- **0.36.0 Check-in-vak**: in een paar tikken stemming, energie, focus en stress (1–5) en een notitie. Wordt opgeslagen in de privé repo `dashboard-data` (niet in deze publieke repo). Een link `#checkin` opent het invulvak direct (zo werken de 3 meldingen per dag).
- **0.37.0 Data-overzicht**: knop "Data" in het check-in-vak met per bron wanneer hij laatst iets ophaalde, hoeveel rijen er zijn en een waarschuwing als een bron 2 dagen stil ligt (ook in het meldingenvak).
- **0.37.1 Hulpprogramma**: telt telefoonmeldingen (alleen tijd en app, geen inhoud) in `helper/meldingen-log.csv` voor het archief. Start het hulpprogramma opnieuw (`helper/start.bat`).
- Alles over het archief zelf (installatie, secrets, exports): README.md in de repo `dashboard-data`.

## 0.35.1 (28 oktober 2026): ingevuld

- Nieuws: **NU.nl** als tweede bron naast de NOS.
- YouTube: **The Yard** en **Ken** (@kenforrest, in 0.35.2) erbij.
- Markten: **ASML** en **Apple**. De AEX is weggehaald: die zit niet in het gratis plan van Twelve Data.
- Snelkoppeling **Canvas** wijst nu naar canvas.eur.nl.
- Focusmodus: **ntfy weggehaald** (de Phone Link-meldingen zijn genoeg).

## 0.35.0 (28 oktober 2026): filmnieuws in plaats van Reddit

Reddit laat geen nieuwe API-apps meer toe (alleen nog voor moderatie) en blokkeert ophalen zonder account. Daarom is het Reddit-vak op de Feeds-pagina vervangen door **Filmnieuws** uit de Letterboxd Journal: kopplaatje, titel, korte intro en categorie, klik opent het artikel. Meer filmbronnen toevoegen kan in `config.js` bij `filmFeeds`. Marijn (`marijn2005`) en je studieplaylist staan er nu ook in. De Reddit-app en -secrets zijn niet meer nodig; heb je al een app aangemaakt op reddit.com/prefs/apps, dan mag je die weggooien.

## 0.28.0 – 0.34.0 (28 oktober 2026): uitbreiding in 7 fases

### Gebouwd

| Versie | Wat |
|---|---|
| 0.28.0 | **Vrienden op Letterboxd**: de GitHub Action haalt elk uur de RSS van Loeka (`loekatheactor`) en Margriet (`Marrie01`) op en schrijft `data/friends.json`. Nieuw vak met posters, naam en sterren; staat een film op je watchlist, dan staat je verwachte cijfer uit de Sterrenvoorspeller erbij. Staand: in het roterende vak. Liggend: derde tabje "Vrienden" naast Film en Laatst gekeken. |
| 0.29.0 | **Draait nu in de bios** in het Film-vak: films van je watchlist die in LantarenVenster draaien, met de eerstvolgende voorstelling (of "t/m 4 nov") en je verwachte cijfer. De Action haalt het programma één keer per dag op (`data/cinema.json`). |
| 0.30.0 | **F1 na de race**: tussen de finish en de volgende sessie toont het F1-vak de uitslag (top 3 groot met vlaggen, 4–10 klein) en het klassement (top 5). Daarna weer de aftelklok. |
| 0.31.0 | **Spotify-maandoverzicht**: top 5 nummers en top 5 artiesten van de afgelopen ~4 weken, met hoezen en foto's. Staand in het roterende vak, liggend in de Meer-balk. |
| 0.32.0 | **Focusmodus**: knop met het klokje in de topbalk. Studietimer (standaard 50 min werken, 10 min pauze, aantal rondes instelbaar), start eventueel je studieplaylist, dempt het meldingenvak, dimt de rest van het dashboard en toont de resterende tijd in de topbalk. Klaar: melding in de browser en (als je een onderwerp invult) via ntfy op je telefoon. **Verjaardagen** uit je Google-agenda in de dagregel ("🎂 Loeka over 3 dagen jarig"); vandaag extra opvallend. Ook: de topbalk op de telefoon staat nu netjes in rijen. |
| 0.33.0 | **Feeds-pagina**: krant-icoon in de topbalk (terug met hetzelfde icoon of Esc). Nieuws (NOS algemeen en sport, extra bron als placeholder), Reddit (in 0.35.0 vervangen door filmnieuws), YouTube (Patrick (H) Willems + placeholders) en Markten (koers, % vandaag, lijntje van de afgelopen maand; alleen weergave). Nieuws, Reddit en YouTube via de Action (elk half uur), markten in je browser. |
| 0.34.0 | **Opruimen en controleren**: alle indelingen nagelopen op 1916×912 en 1366×768 (liggend), 1080×1920 (staand) en 375×812 (telefoon) met een script dat zoekt naar onderdelen die buiten hun vak steken. Gerepareerd: posters in de liggende tabjes Laatst gekeken/Vrienden vielen half buiten het vak (schalen nu mee), F1-uitslag op 1366×768. CLAUDE.md bijgewerkt. |

Eén Action ("Dashboard-data", bestand `.github/workflows/letterboxd.yml`) doet alles: elk uur Letterboxd + bioscoop (die laatste één keer per dag), elk half uur de feeds. Hij commit alleen als er echt iets veranderd is.

### Niet (helemaal) gebouwd, en waarom

- **Pathé (De Kuip, Schouwburgplein)**: pathe.nl weigert verzoeken die zich eerlijk als GitHub Action melden (fout 403). Ik ga ons niet als gewone browser voordoen om dat te omzeilen, dus Pathé zit er niet in.
- **KINO Rotterdam**: hun robots.txt verbiedt het ophalen van de filmladder (`/filmladder`). Overgeslagen.
- **LantarenVenster**: werkt wel (openbare RSS). Voorstellingstijden worden alleen opgezocht voor films die op de watchlist-snapshot in de repo staan (zo blijft het bij een paar verzoeken per dag). Voor andere watchlist-films staat er "t/m <datum>" of "in het programma".
- **Reddit**: kon niet meer (geen nieuwe API-apps, ophalen zonder account geblokkeerd). In 0.35.0 vervangen door filmnieuws.
- **AEX in Markten**: Twelve Data heeft indexen zoals de AEX mogelijk niet in het gratis plan. Dan staat er "niet beschikbaar" bij; de rest werkt gewoon.
- **Verjaardagen uit Google Contacten**: via de verjaardagen-agenda in Google Agenda (die bevat je contacten). Een aparte Contacten-koppeling (extra toestemming) was niet nodig.
- **De Action zelf** heb ik niet op GitHub kunnen starten (geen GitHub-programma op deze pc). Alles is lokaal getest; de eerste echte run volgt vanzelf op :17 of :47.

### Wat je zelf moet invullen

**In `config.js`** (op GitHub: bestand openen → potloodje → aanpassen → "Commit changes"):

| Waar | Wat |
|---|---|

**Op het dashboard zelf** (blijft alleen in je eigen browser, staat nergens op GitHub):

- **Twelve Data-key** (voor aandelen/indexen): maak gratis een account op twelvedata.com → Dashboard → API key kopiëren → Feeds-pagina → Markten → onderaan plakken → Opslaan.

**Secrets in GitHub**: geen nieuwe nodig. `TMDB_API_KEY` staat er al.

### Testen

Doe **Ctrl+F5** op het dashboard. Kijk daarna bij GitHub → **Actions** → "Dashboard-data" of de eerste run groen is (of klik daar op **Run workflow** om hem meteen te draaien).
