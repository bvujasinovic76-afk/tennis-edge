"use client";

import { useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { SectionHead } from "./ui";
import { BankrollProvider } from "./BankrollContext";
import BankrollPanel from "./BankrollPanel";
import DailyPlan from "./DailyPlan";
import Fixtures from "./Fixtures";
import MatchAnalysis from "./MatchAnalysis";
import Strategies from "./Strategies";
import Calculator from "./Calculator";
import Research from "./Research";
import AiCouncil from "./AiCouncil";
import ArchiveList from "./ArchiveList";

export default function Workbench({ players }: { players: Player[] }) {
  const [pick, setPick] = useState<{ a: string; b: string; surface: Surface } | null>(null);
  const [pickKey, setPickKey] = useState(0);

  function handlePick(a: string, b: string, surface: Surface) {
    setPick({ a, b, surface });
    setPickKey((k) => k + 1);
    document.getElementById("analiza")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <BankrollProvider>
      <section className="py-10 border-b border-line">
        <SectionHead num="02" title="Moj bankroll i tiketi" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Unesi svoj ukupan ulog (npr. 10.000 RSD). Aplikacija predlaže tačan iznos po paru (¼-Kelly), a svaki
          odigrani tiket se prati — profit/gubitak, ROI i uspešnost se same računaju kako obeležavaš ishode.
        </p>
        <BankrollPanel />
      </section>

      <section className="py-10 border-b border-line">
        <SectionHead num="03" title="Dnevni plan — šta igrati danas" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Automatski prolazi kroz nadolazeće ATP mečeve, poredi Elo model sa tržišnim kvotama (Sofascore), i
          rangira mečeve sa edge-om — sa tačnim iznosom uloga iz tvog bankrolla. Klikni &quot;Dodaj na tiket&quot;.
        </p>
        <DailyPlan onAnalyze={handlePick} />
      </section>

      <section className="py-10 border-b border-line">
        <SectionHead num="04" title="Nadolazeći i live ATP mečevi" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Uživo i sledeći mečevi se automatski učitavaju (Sofascore, osvežava se na 60s). Klikni &quot;Analiziraj&quot;
          da pošalješ meč u kalkulator, istraživanje i AI konzilijum ispod.
        </p>
        <Fixtures onPick={handlePick} />
      </section>

      <section id="analiza" className="py-10 border-b border-line">
        <SectionHead num="05" title="Analiza meča — pregled za ljude" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Izaberi dva igrača i dobijaš analizu napisanu ljudskim jezikom — ko je favorit i zašto, u kakvoj su formi,
          kome leži podloga, šta kaže rang i (ako uneseš kvote) gde je value. Pored toga i tabela jedan-pored-drugog,
          da sve vidiš na jedan pogled. Računa se odmah iz podataka, bez AI kredita.
        </p>
        <MatchAnalysis key={`analysis-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
      </section>

      <section id="strategije" className="py-10 border-b border-line">
        <SectionHead num="06" title="Strategije — koja najbolje pristaje meču" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Za izabrani meč računam u procentima koliko svaka strategija odgovara (čista matematika iz Elo-a i kvota —
          ne troši AI kredit). Najbolja je označena kao „Preporučeno", ali ti biraš koju ćeš igrati. Sistemi koji
          traže podatke koje još nemamo (WTA live, Betfair trejding, stoni tenis) su iskreno označeni kao nepodržani.
        </p>
        <Strategies key={`strat-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
      </section>

      <section id="kalkulator" className="py-10 border-b border-line">
        <SectionHead num="07" title="Value-bet kalkulator" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Izaberi dva igrača (pretraga po celoj bazi od {players.length} igrača) i podlogu, unesi kvote — dobijaš
          Elo verovatnoću, de-vig tržišnu verovatnoću, edge, Kelly ulog, i dugme da odmah dodaš na tiket.
        </p>
        <Calculator key={`calc-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
      </section>

      <section className="py-10 border-b border-line">
        <SectionHead num="08" title="Istraživanje uživo — povrede, srpske kvote, forumi" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Tri agenta pretražuju internet u realnom vremenu: jedan lovi povrede i vesti, jedan gleda srpske
          kladionice i kretanje kvota, jedan čita forume i sentiment zajednice. Glavni istraživač spaja sve u
          kratak brifing sa procenom rizika i izvorima.
        </p>
        <Research key={`research-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
      </section>

      <section className="py-10 border-b border-line">
        <SectionHead num="09" title="AI konzilijum" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Pet AI analitičara (svaki drugi model, drugi karakter) nezavisno daju pick, sudija ocenjuje njihovo
          rezonovanje naspram Elo brojeva, glavni analitičar sklapa finalni plan igre sa Kelly ulogom.
        </p>
        <AiCouncil key={`council-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
      </section>

      <section className="py-10 border-b border-line">
        <SectionHead num="10" title="Arhiva analiza" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Svaka AI analiza (konzilijum i istraživanje) se automatski čuva — imaš istoriju, a ako neko za isti meč
          već ima svežu analizu (24h), dobijaš je iz arhive bez trošenja kredita.
        </p>
        <ArchiveList />
      </section>
    </BankrollProvider>
  );
}
