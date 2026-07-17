import Workbench from "@/components/Workbench";
import AuthStatus from "@/components/AuthStatus";
import Guide from "@/components/Guide";
import { StatTile } from "@/components/ui";
import { ratings, players } from "@/lib/ratings";

export default function Home() {
  const bt = ratings.backtest;
  const roiPositive = bt.roiPct > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 pb-24">
      {/* kompaktan header — dashboard je zvezda, ne naslov */}
      <header className="pt-8 pb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div className="flex items-baseline gap-3">
          <span className="font-display font-bold text-2xl text-ink" style={{ fontStretch: "85%" }}>
            EDGE — Tenis
          </span>
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted hidden sm:inline">
            Elo · {ratings.matchesUsed.toLocaleString("sr-RS")} mečeva · {players.length} igrača
          </span>
        </div>
        <AuthStatus />
      </header>

      <Workbench players={players} />

      {/* sekundarno: kako se koristi + track record modela */}
      <section className="pt-8 border-t border-line space-y-4">
        <Guide />

        <details className="rounded-lg border border-line bg-surface px-5 py-3.5 open:pb-5">
          <summary className="cursor-pointer select-none text-sm font-semibold text-ink hover:text-accent transition-colors">
            📊 Track record modela — koliko mu se sme verovati
          </summary>
          <p className="mt-4 text-sm text-ink-soft max-w-[70ch]">
            Rejtinzi su građeni hronološki, meč po meč — za svaki test-meč korišćen je samo rejting kakav je bio{" "}
            <em>pre</em> tog meča. Poređeno protiv Pinnacle zatvarajućih kvota ({bt.windowStart} – {bt.windowEnd}).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatTile label="Testirano mečeva" value={bt.matchesTested.toLocaleString("sr-RS")} />
            <StatTile label="Tačnost favorita" value={`${bt.favoriteAccuracyPct}%`} />
            <StatTile label="Log-loss" value={bt.avgLogLoss.toFixed(3)} />
            <StatTile label="ROI" value={`${bt.roiPct > 0 ? "+" : ""}${bt.roiPct}%`} tone={roiPositive ? "good" : "risk"} />
          </div>
          <div className="mt-4 rounded-r-lg border-l-[3px] border-accent bg-paper px-4 py-3">
            <p className="text-sm text-ink">
              {roiPositive ? (
                <>Model pokazuje pozitivan ROI na out-of-sample periodu — dobar znak, ali još premalo mečeva za konačan dokaz.</>
              ) : (
                <>
                  Model <strong>gubi {Math.abs(bt.roiPct)}%</strong> protiv Pinnacle linije na{" "}
                  {bt.valueBetsFlagged.toLocaleString("sr-RS")} pickova. Tačnost od {bt.favoriteAccuracyPct}% je pristojna,
                  ali to tržište već zna. <strong>Igraj male iznose — ovo je alat za praćenje i učenje, ne dokazan edge.</strong>
                </>
              )}
            </p>
          </div>
          {ratings.eloV2 && (
            <p className="mt-4 text-[13px] text-ink-soft max-w-[70ch]">
              <strong>Eksperiment faze 2:</strong> model v2 sa formom, H2H i danima odmora ispao je{" "}
              <span className="tabular text-risk font-semibold">gori</span> (ROI {ratings.eloV2.backtest.roiPct}%, tačnost{" "}
              {ratings.eloV2.backtest.favoriteAccuracyPct}%) od čistog Elo-a. Elo već upija formu kroz ažuriranje. Zato
              koristimo v1 — i zato ne veruj tipsterima koji „formu i H2H" prodaju kao edge.
            </p>
          )}
        </details>
      </section>

      <footer className="pt-8 text-xs text-muted space-y-1">
        <p>
          Podaci: tennis-data.co.uk (ATP 2022–2026) + Sofascore/ESPN (live feed). Informativno/edukativno — 18+,
          klađenje je odgovornost korisnika.
        </p>
      </footer>
    </div>
  );
}
