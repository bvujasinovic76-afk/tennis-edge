import Workbench from "@/components/Workbench";
import PlayerDirectory from "@/components/PlayerDirectory";
import AuthStatus from "@/components/AuthStatus";
import { MetaCell, SectionHead, StatTile } from "@/components/ui";
import { ratings, players } from "@/lib/ratings";

export default function Home() {
  const bt = ratings.backtest;
  const roiPositive = bt.roiPct > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 sm:px-6 pb-24">
      {/* masthead */}
      <header className="pt-14 pb-9 border-b border-line">
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="font-mono text-xs tracking-[0.14em] uppercase text-muted">
            Interni MVP · Elo engine v1 · Tenis
          </p>
          <AuthStatus />
        </div>
        <h1 className="font-display font-bold text-6xl sm:text-7xl leading-[0.92] text-ink mb-2" style={{ fontStretch: "85%" }}>
          EDGE — Tenis
        </h1>
        <p className="text-lg text-ink-soft max-w-[56ch] mb-7">
          Elo rejting model treniran na {ratings.matchesUsed.toLocaleString("sr-RS")} stvarnih ATP mečeva
          ({ratings.dateRange[0]} – {ratings.dateRange[1]}), sa live mečevima, value-bet kalkulatorom i AI
          konzilijumom.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line rounded-lg overflow-hidden">
          <MetaCell k="Mečeva u modelu" v={ratings.matchesUsed.toLocaleString("sr-RS")} />
          <MetaCell k="Igrača u bazi" v={String(players.length)} />
          <MetaCell k="K-faktor" v={String(ratings.eloModel.kFactor)} />
          <MetaCell k="Blend" v="50/50 overall + podloga" />
        </div>
      </header>

      {/* backtest / track record */}
      <section className="py-10 border-b border-line">
        <SectionHead num="01" title="Track record modela (walk-forward backtest)" />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Rejtinzi su građeni hronološki, meč po meč — za svaki test-meč je korišćen samo rejting kakav je bio{" "}
          <em>pre</em> tog meča, bez uvida u budućnost. Poređeno je protiv Pinnacle zatvarajućih kvota
          ({bt.windowStart} – {bt.windowEnd}), najoštrijeg dostupnog tržišta.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Testirano mečeva" value={bt.matchesTested.toLocaleString("sr-RS")} />
          <StatTile label="Tačnost favorita" value={`${bt.favoriteAccuracyPct}%`} />
          <StatTile label="Log-loss" value={bt.avgLogLoss.toFixed(3)} />
          <StatTile
            label="ROI na flagovane pickove"
            value={`${bt.roiPct > 0 ? "+" : ""}${bt.roiPct}%`}
            tone={roiPositive ? "good" : "risk"}
          />
        </div>
        <div className="mt-5 rounded-r-lg border-l-[3px] border-accent bg-surface shadow-sm px-5 py-4">
          <span className="inline-block text-[11px] uppercase tracking-wide font-bold rounded px-2 py-0.5 mb-2 bg-accent text-accent-contrast">
            Status
          </span>
          <p className="text-ink">
            {roiPositive ? (
              <>Model trenutno pokazuje pozitivan ROI na out-of-sample periodu — i dalje premalo mečeva da bude konačan dokaz, ali dobar znak.</>
            ) : (
              <>
                Model v1 (Elo + podloga) <strong>trenutno gubi {Math.abs(bt.roiPct)}%</strong> protiv Pinnacle
                zatvarajuće linije na {bt.valueBetsFlagged.toLocaleString("sr-RS")} flagovanih pickova. Tačnost
                favorita od {bt.favoriteAccuracyPct}% je pristojna, ali to tržište već zna — nema edge dok se ne
                doda forma, umor i H2H (faza 2 iz brief-a). <strong>Ne naplaćuj pickove na ovoj verziji modela.</strong>
              </>
            )}
          </p>
        </div>
      </section>

      <Workbench players={players} />

      {/* player directory */}
      <section className="py-10 border-b border-line">
        <SectionHead num="09" title={`Baza igrača (${players.length}) — pretraga i ATP rang`} />
        <p className="text-ink-soft max-w-[68ch] mb-5">
          Svi igrači sa bar jednim odigranim mečem u 2022–2026 skupu podataka, sortirano po realnom ATP rangu
          (poslednji poznat rang iz istorijskih mečeva, ne Elo).
        </p>
        <PlayerDirectory players={players} />
      </section>

      <footer className="py-10 text-sm text-muted space-y-2">
        <p>
          Podaci: tennis-data.co.uk (ATP rezultati i kvote, 2022–2026) + Sofascore (javni live/upcoming feed).
          Samo u informativne/edukativne svrhe — 18+, klađenje je odgovornost korisnika.
        </p>
        <p>Sledeći koraci: faza 2 modela (forma, H2H, umor) pre bilo kakve naplate — videti EDGE brief.</p>
      </footer>
    </div>
  );
}
