# EDGE — Tenis (MVP)

Elo rejting model, live ATP mečevi, value-bet kalkulator i AI konzilijum za tenis.
Deo je šireg "EDGE" koncepta (analitička platforma za value bets u fudbalu, košarci
i tenisu) — ovo je prvi konkretan, radni MVP, fokusiran samo na tenis.

## Šta ovo radi

- **Elo engine** (`scripts/build_elo.py`) čita stvarne ATP rezultate i kvote sa
  [tennis-data.co.uk](http://www.tennis-data.co.uk/) (2022–2026, ~12.300 mečeva),
  gradi rejting hronološki (meč po meč, bez uvida u budućnost) i računa overall +
  po-podlozi Elo za **543 igrača**, svakog sa realnim ATP rangom (poslednji poznat
  WRank/LRank iz istorijskih mečeva), **formom (W-L u poslednjih 10 mečeva)** i
  **% pobeda po podlozi** (Hard/Clay/Grass). Forma i surface% su podaci faze 2 koji
  napajaju kriterijume Sistema 88% (prave ✓/✗ umesto „?").
- **Walk-forward backtest** poredi model protiv Pinnacle zatvarajućih kvota
  (najoštrije tržište) na periodu jun 2025 – jul 2026, i meri realnu tačnost,
  log-loss i ROI da bi model imao dokaz pre nego što bilo šta naplati.
- **Nadolazeći ATP mečevi** (`/api/fixtures`) — pametan izvor: Sofascore prvi
  (bogatiji — ATP rang + kvote; radi lokalno preko curl-a), **ESPN javni scoreboard
  kao fallback koji radi i na Vercelu** (bez ključa, native fetch). Live rezultati,
  sledeći mečevi, unakrsno mapiranje na našu Elo bazu, dugme "Analiziraj".
- **Auto-obeležavanje tiketa** (`/api/autosettle`) — dugme "Proveri rezultate" u
  bankroll panelu: povuče završene mečeve (ESPN), upari ih sa tvojim tiketima
  "u toku" (radi i sa obrnutim redosledom igrača i sufiksom strategije) i sam
  obeleži dobitak/gubitak.
- **Arhiva analiza + keš** (`/api/analyses`, tabela `analyses`) — svaka uspešna
  AI analiza (konzilijum/istraživanje) se čuva u Supabase; ako za isti par i
  podlogu postoji analiza mlađa od 24h, vraća se iz arhive **bez trošenja
  kredita** (radi i za obrnut redosled igrača). Prijavljen korisnik vidi svoju
  istoriju u sekciji "Arhiva analiza".
- **Analiza meča — pregled za ljude** (`src/lib/narrative.ts`, 0 API kredita):
  za izabrani par generiše analizu na srpskom koja se čita kao ljudski analitičar —
  ko je favorit i zašto, forma, kome leži podloga, rang, i (uz kvote) gde je value —
  plus uporednu tabelu jedan-pored-drugog sa označenim boljim u svakoj kategoriji.
- **Vodič + rečnik** na vrhu sajta — tok rada u 6 koraka i objašnjenja pojmova
  (edge, de-vig, Kelly, ROI...) da sve bude razumljivo i nekome ko se ne bavi ovim.
- **Grafik kretanja bankrolla** u bankroll panelu — linija kroz obeležene tikete,
  sa isprekidanom linijom početnog uloga.
- **Baza igrača** — pretraga po imenu preko svih 543 igrača, sortirano po
  realnom ATP rangu (ne po Elo-u).
- **Value-bet kalkulator**: unesi dva igrača + kvote — dobijaš Elo verovatnoću,
  de-vig tržišnu verovatnoću, edge u procentnim poenima, i **tačan predlog
  uloga po Kelly kriterijumu** (koliko % bankrolla, ne samo "nizak/srednji/visok").
- **Bankroll i tiketi** (`/api/bankroll`): uneseš ukupan ulog (npr. 10.000 RSD),
  aplikacija predlaže tačan iznos po paru (¼-Kelly od trenutnog bankrolla), a svaki
  odigran tiket se prati — obeležiš dobitak/gubitak i profit, ROI, uspešnost i
  trenutni bankroll se sami preračunaju. Stanje se čuva lokalno u
  `data/bankroll.json` (jedan korisnik; višekorisnički nalozi dolaze sa Supabase korakom).
- **Dnevni plan** (`/api/plan`): automatski prolazi kroz nadolazeće ATP mečeve,
  poredi Elo model sa tržišnim kvotama (Sofascore), rangira mečeve sa edge-om i uz
  svaki daje tačan RSD ulog iz tvog bankrolla + dugme "Dodaj na tiket".
- **Strategije** (`src/lib/strategies.ts`, čista lokalna matematika — 0 API kredita):
  za izabrani meč računa u procentima koliko svaka strategija pristaje, rangira ih i
  označava preporučenu, a ti biraš koju igraš. Podržane (iz naših podataka):
  *Top-Down Value* (de-vig + Kelly), *Sistem 88%* (favorit 2:0, traži rang jaz ≥50 +
  dominaciju na podlozi + formu — kriterijumi se prikazuju sa ✓/✗/? i ono što nemamo
  je iskreno „nepoznato, proveri kroz Istraživanje"), *Sistem 20.0* (bar 1 set + prvi
  set Over 7.5), i *Preskoči meč*. Sistemi koji traže podatke/sport koje nemamo
  (WTA live Under, Betfair trejding, BODMAS stoni tenis) su prikazani ali jasno
  označeni kao nepodržani, umesto lažnog procenta.
- **Istraživanje uživo** (`/api/research`, OpenRouter web-search): tri agenta
  pretražuju internet u realnom vremenu — jedan lovi povrede/vesti (Claude Sonnet 5),
  jedan gleda **srpske kladionice** i kretanje kvota (Grok 4.5), jedan čita forume i
  sentiment (Perplexity Sonar). Glavni istraživač (Claude Opus 4.8) spaja sve u kratak
  brifing sa procenom rizika i klikabilnim izvorima.
- **AI konzilijum** (`/api/predict`, preko [OpenRouter](https://openrouter.ai)): pet
  AI analitičara — svaki drugi model, svaki drugi "karakter" — nezavisno analiziraju
  meč (Kritičar → GLM 5.1, Sigurica → Gemini 3.1 Pro, Rizikaš → Grok 4.5,
  Matematičar → Qwen3 Max Thinking, Statističar → Claude Sonnet 5). Sudija
  (Claude Opus 4.8) ocenjuje rezonovanje svakog naspram stvarnih Elo/kvota
  brojeva i traži kontradikcije, a na kraju glavni analitičar (Claude Opus 4.8)
  sklapa finalni plan igre (sa Kelly ulogom ako uneseš kvotu) ponderisan tim
  ocenama — ne prosto glasanje.

### Podešavanje AI konzilijuma

1. Napravi ključ na [openrouter.ai/keys](https://openrouter.ai/keys)
2. `cp .env.example .env.local` i upiši `OPENROUTER_API_KEY=...`
3. Restartuj `npm run dev`

Bez ključa, sve ostalo (mečevi, kalkulator, baza igrača) radi normalno — samo AI
konzilijum vraća jasnu poruku da ključ nedostaje. Model slugovi su u
`src/lib/personas.ts`. Jedan poziv (5 paralelnih + sudija + finale) traje ~40–60s
i troši OpenRouter kredit za 7 poziva modela.

## Trenutni status modela — pročitaj ovo pre bilo kakvog lansiranja

Backtest (`data/elo_ratings.json → backtest`) trenutno pokazuje **negativan ROI od
otprilike -11%** na flagovane value-bet pickove naspram Pinnacle linije. Tačnost
biranja favorita (~64%) je solidna, ali to tržište već cenuje — čist Elo model
nema dokazan edge. **Ne naplaćuj pickove dok ovo ne postane pozitivno na
out-of-sample periodu.**

Bankroll/Kelly ulozi i dnevni plan su matematički tačni ZA BROJEVE KOJE MODEL DAJE
— ali pošto model nema dokazan edge, tretiraj bankroll i dnevni plan kao **alat za
praćenje i simulaciju/učenje na malim iznosima**, ne kao dokazano profitabilne
savete. Istraživanje uživo (povrede/kvote/forumi) je tu upravo da uhvati ono što
goli Elo model ne vidi, pre nego što odigraš. 18+, klađenje je odgovornost korisnika.

**Faza 2 — urađeno i pošteno izvešteno**: model v2 (Elo + forma + H2H + dani odmora,
logistička regresija sa zamrznutim Elo koeficijentom, treniran pre 2025-06 i testiran
walk-forward posle) je **GORI od čistog Elo-a**: ROI ≈ −17% vs −11%, tačnost 62.8% vs
64.3%, lošiji log-loss. Elo već upija formu kroz svakodnevno ažuriranje — forma/H2H ne
donose nov signal. Aplikacija zato i dalje koristi v1, a v2 eksperiment je prikazan u
track record sekciji (`eloV2` u JSON-u). Praktična pouka: "forma i H2H" koje tipsteri
prodaju kao edge — nisu edge.

## Pokretanje

```bash
npm install
npm run dev
```

Otvori [http://localhost:3000](http://localhost:3000).

## Nadolazeći/uživo mečevi — kako radi i gde je krhko

`src/lib/sofascore.ts` čita Sofascore-ov javni API (bez ključa, koriste ga mnogi
open-source sport dashboardi). Dve bitne napomene:

1. **Sofascore blokira Node-ov `fetch()` (403), ali ne i `curl`** — verovatno
   fingerprintuje TLS/HTTP2 rukovanje, ne header-e. Zato `sofaFetch()` poziva
   sistemski `curl` binarni fajl umesto `fetch()`. Ovo radi na Windows 10/11 i
   skoro svim Linux image-ima (curl je preinstaliran), ali **neće raditi na
   serverless hostingu bez shell pristupa (npr. Vercel)** dok se ne zameni pravim
   fixtures API-jem (RapidAPI Tennis Live Data / API-Tennis) koji nema ovaj problem.
2. **Podloga se pogađa iz naziva turnira** (`surfaceGuess` u `src/app/api/fixtures/route.ts`)
   jer ovaj Sofascore endpoint ne vraća podlogu direktno — lista poznatih
   šljaka/trava turnira je ručno održavana i nepotpuna van sezone. Malo, ali
   realno ograničenje dok se ne doda pravi fixtures API sa podlogom.

Ime-matching (`src/lib/nameMatch.ts`) povezuje Sofascore-ovo "Ime Prezime" sa
našim "Prezime I." formatom best-effort — igrači van naše baze (npr. qualifieri
koji nisu odigrali nijedan meč 2022–2026) ostaju prikazani ali bez Elo modela i
bez dugmeta "Analiziraj" (jasno onemogućeno u UI-ju, ne lažni rezultat).

## Osvežavanje rejtinga sa novijim podacima

1. Preuzmi noviji `<godina>.xlsx` sa `http://www.tennis-data.co.uk/<godina>/<godina>.xlsx`
2. Stavi ga u `scripts/raw/atp_<godina>.xlsx`
3. `pip install pandas openpyxl` (ako već nije instalirano)
4. Pokreni `python scripts/build_elo.py` — piše novi `data/elo_ratings.json`

## Istraživanje uživo — podešavanje i cena

Koristi isti `OPENROUTER_API_KEY` kao AI konzilijum, plus OpenRouter web-search
plugin (naplaćuje se po pretrazi). Jedan pokret istraživanja = 3 web pretrage +
1 sinteza (~30–90s, troši nešto više kredita nego običan poziv). Modeli agenata su
u `src/lib/researchAgents.ts` — lako se menjaju. Napomena: `perplexity/sonar` je
izabran za forum-agenta jer je Gemini na tom zadatku znao da vrati prazan odgovor;
sinteza svejedno gracefully radi i ako jedan agent zataji.

## Sledeći koraci ka pravom proizvodu

1. **Faza 2 delimično urađena**: forma (W-L 10) i % pobeda po podlozi su izračunati i
   ušli u kriterijume Sistema 88%. Sledeće: uklopiti ih i u samu Elo verovatnoću
   (forma-korekcija + umor/dani odmora + H2H) i **ponovo backtestovati** — tek ako
   ROI pređe u plus na out-of-sample periodu, model ima dokazan edge.
2. Kad ROI postane pozitivan na out-of-sample periodu — dodati live kvote
   (The Odds API / RapidAPI) umesto ručnog unosa.
3. Pravi fixtures feed sa podlogom (RapidAPI Tennis Live Data / API-Tennis) —
   ukida i curl-workaround i surface-guessing.
4. Supabase (auth + baza) za višekorisničke naloge i bankroll u bazi umesto lokalnog
   fajla; Stripe za pretplatu, po planu iz EDGE brief-a.
5. Keširati AI konzilijum i istraživanje (Supabase) da se isti meč ne plaća dvaput.
6. Automatski povezati istraživanje u dnevni plan (da agenti sami označe rizične
   mečeve pre nego što uđu u plan).
