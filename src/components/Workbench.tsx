"use client";

import { useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { BankrollProvider } from "./BankrollContext";
import Dashboard from "./Dashboard";
import Tabs from "./Tabs";
import ChatAssistant from "./ChatAssistant";
import DailyPlanCalendar from "./DailyPlanCalendar";
import TicketsOfDay from "./TicketsOfDay";
import TicketScan from "./TicketScan";
import TournamentsWorld from "./TournamentsWorld";
import BankrollPanel from "./BankrollPanel";
import MatchAnalysis from "./MatchAnalysis";
import Strategies from "./Strategies";
import Calculator from "./Calculator";
import Research from "./Research";
import AiCouncil from "./AiCouncil";
import ArchiveList from "./ArchiveList";
import Coach from "./Coach";
import SystemsBacktest from "./SystemsBacktest";
import PlayerDirectory from "./PlayerDirectory";

/**
 * Sve u 5 glavnih tabova da stranica ne bude beskonačan skrol:
 * Danas (listić) · Tiketi (kombinacije/skener/istorija) · Chat · Uživo (svet) · Alati (dubinska analiza).
 */
export default function Workbench({ players }: { players: Player[] }) {
  const [pick, setPick] = useState<{ a: string; b: string; surface: Surface } | null>(null);
  const [pickKey, setPickKey] = useState(0);
  const [mainTab, setMainTab] = useState("danas");
  const [toolTab, setToolTab] = useState("analiza");

  function handlePick(a: string, b: string, surface: Surface) {
    setPick({ a, b, surface });
    setPickKey((k) => k + 1);
    setMainTab("alati");
    setToolTab("analiza");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const intro = (text: string) => <p className="text-ink-soft max-w-[68ch] mb-4 text-sm">{text}</p>;

  return (
    <BankrollProvider>
      <div className="py-6 space-y-5">
        <Dashboard />

        <Tabs
          key={`main-${mainTab}-${pickKey}`}
          initial={mainTab}
          tabs={[
            {
              id: "danas",
              label: "📋 Danas",
              content: <DailyPlanCalendar onAnalyze={handlePick} />,
            },
            {
              id: "tiketi",
              label: "🎟️ Tiketi",
              content: (
                <div className="space-y-5">
                  <TicketsOfDay onAnalyze={handlePick} />
                  <TicketScan />
                  <BankrollPanel />
                </div>
              ),
            },
            {
              id: "chat",
              label: "💬 Chat",
              content: <ChatAssistant />,
            },
            {
              id: "uzivo",
              label: "🌍 Uživo",
              content: <TournamentsWorld onAnalyze={handlePick} />,
            },
            {
              id: "alati",
              label: "🧰 Alati",
              content: (
                <Tabs
                  key={`tool-${toolTab}-${pickKey}`}
                  initial={toolTab}
                  tabs={[
                    {
                      id: "analiza",
                      label: "Analiza para",
                      content: (
                        <>
                          {intro("Analiza ljudskim jezikom + tabela jedan-pored-drugog + tipovi sa istorijskom prolaznošću.")}
                          <MatchAnalysis key={`an-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                        </>
                      ),
                    },
                    {
                      id: "greske",
                      label: "🔍 Gde grešim",
                      content: (
                        <>
                          {intro("Ubaci odigrane tikete (slikaj u Tiketi ili unesi ručno) — pa vidiš gde gubiš i šta bi drugačije donelo bolji ishod.")}
                          <Coach />
                        </>
                      ),
                    },
                    {
                      id: "sistemi",
                      label: "📊 Sistemi",
                      content: (
                        <>
                          {intro("Backtest na 2.928 stvarnih mečeva: kako prolazi 1 singl, 2 singla, kombinacije 2/3/4 para.")}
                          <SystemsBacktest />
                        </>
                      ),
                    },
                    {
                      id: "strategije",
                      label: "Strategije",
                      content: (
                        <>
                          {intro("U procentima koliko svaka strategija pristaje meču — ti biraš koju igraš.")}
                          <Strategies key={`st-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                        </>
                      ),
                    },
                    {
                      id: "kalkulator",
                      label: "Kalkulator",
                      content: (
                        <>
                          {intro(`Elo verovatnoća, de-vig, edge i Kelly ulog — svih ${players.length} igrača.`)}
                          <Calculator key={`ca-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                        </>
                      ),
                    },
                    {
                      id: "istrazivanje",
                      label: "Istraživanje",
                      content: (
                        <>
                          {intro("Agenti uživo pretražuju internet: povrede i vesti, srpske kvote, forumi — možeš pozvati i samo jednog.")}
                          <Research key={`re-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                        </>
                      ),
                    },
                    {
                      id: "konzilijum",
                      label: "AI konzilijum",
                      content: (
                        <>
                          {intro("AI analitičari različitih karaktera — izaberi koje zoveš; sudija i finale idu uz 2+.")}
                          <AiCouncil key={`co-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                        </>
                      ),
                    },
                    {
                      id: "arhiva",
                      label: "Arhiva",
                      content: (
                        <>
                          {intro("Svaka AI analiza se čuva — isti meč u 24h dolazi iz arhive besplatno.")}
                          <ArchiveList />
                        </>
                      ),
                    },
                    {
                      id: "baza",
                      label: "Baza igrača",
                      content: (
                        <>
                          {intro(`Svih ${players.length} igrača — ATP rang, forma, procenat pobeda po podlozi.`)}
                          <PlayerDirectory players={players} />
                        </>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </BankrollProvider>
  );
}
