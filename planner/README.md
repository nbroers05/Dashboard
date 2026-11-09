# Planner

Eigen planner, los van het dashboard. Komt te staan op https://nbroers05.github.io/Dashboard/planner/

Zonder Supabase kun je hem al bekijken met nepdata: https://nbroers05.github.io/Dashboard/planner/?demo

## Wat jij zelf moet doen (eenmalig, ongeveer 10 minuten)

De knoppen in Supabase kunnen net iets anders heten dan hier staat.

1. **Account en project.** Ga naar https://supabase.com, maak een account en een nieuw project. Regio: een in Europa (bijvoorbeeld Frankfurt). Bewaar het database-wachtwoord dat je kiest, de planner gebruikt het niet.
2. **Tabellen maken.** Open in je project **SQL Editor**, klik **New query**, plak de hele inhoud van `planner/supabase.sql` en klik **Run**. Je ziet "Success. No rows returned". Daarna staan `planner_tasks` en `planner_subjects` onder **Table Editor**, met het slotje van RLS aan.
3. **Sleutels invullen.** Ga naar **Project Settings** en dan **Data API** en **API Keys**. Je hebt de **Project URL** nodig en de **anon public** key (in nieuwere schermen heet die **publishable** key). Open https://github.com/nbroers05/Dashboard/edit/main/planner/config.js, vervang `SUPABASE_URL_HIER` en `SUPABASE_ANON_KEY_HIER` (de aanhalingstekens blijven staan) en klik **Commit changes**. Deze twee mogen openbaar. De **service_role** of **secret** key nooit gebruiken.
4. **Je account maken.** Ga naar **Authentication**, dan **Users**, **Add user**, **Create new user**. Vul je mail en een eigen wachtwoord in en zet **Auto Confirm User** aan.
5. **Niemand anders laten inschrijven.** Ga naar **Authentication**, dan **Sign In / Providers**, en zet **Allow new users to sign up** uit.
6. **Inloggen.** Wacht een minuut of twee en open de planner op de pc en op je telefoon. Log op beide in met je mail en wachtwoord.

Wachtwoord vergeten: in Supabase bij **Authentication**, **Users** kun je het per gebruiker opnieuw instellen.

## Google Agenda

De planner leest je agenda alleen; er gaat niets terug naar Google. In een browser waar het dashboard al is ingelogd werkt het meteen. Staat er "Agenda niet gekoppeld", vul dan de wachtzin van het dashboard in. Lukt dat niet, koppel Google dan opnieuw via het hulpprogramma op je pc (127.0.0.1:8765/koppel) en maak de inlogbundel opnieuw.

## Goed om te weten

- De gratis versie van Supabase pauzeert een project als het ongeveer een week niet is gebruikt. Dan kun je het in het Supabase-scherm met één klik weer aanzetten.
- Op het dashboard uitloggen wist alle opslag van de site in die browser, dus dan ben je daar ook uit de planner uitgelogd.
- Je taken staan alleen in Supabase. In deze repo staat geen planner-data.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | Indeling en dialogen |
| `planner.css` | Eigen opmaak, los van het dashboard |
| `app.js` | Scherm, slepen, dialogen |
| `store.js` | Opslag: Supabase, live bijwerken, nepdata voor `?demo` |
| `agenda.js` | Google Agenda lezen, herkennen van diensten, deadlines, verjaardagen en F1 |
| `config.js` | Supabase-adres en anon key |
| `supabase.sql` | Tabellen en Row Level Security |
| `CHANGELOG.md` | Versies van de planner |
