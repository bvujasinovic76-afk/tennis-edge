/**
 * Vodič + rečnik pojmova — statični sadržaj (server component, native <details>),
 * da svaki pojam na sajtu bude razumljiv čoveku koji se ne bavi klađenjem profesionalno.
 */
export default function Guide() {
  return (
    <details className="mt-4 rounded-lg border border-line bg-surface px-5 py-3.5 open:pb-5">
      <summary className="cursor-pointer select-none text-sm font-semibold text-ink hover:text-accent transition-colors">
        📖 Kako se koristi — vodič za 60 sekundi + rečnik pojmova
      </summary>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-2.5">Tok rada — korak po korak</p>
          <ol className="space-y-2 text-sm text-ink-soft list-none">
            {[
              ["1", "Prijavi se i u sekciji „Moj bankroll” unesi ukupan ulog kojim raspolažeš (npr. 10.000 RSD)."],
              ["2", "Pogledaj „Dnevni plan” — automatski predlaže šta se danas igra i tačan iznos po tiketu."],
              ["3", "Za meč koji te zanima klikni „Analiziraj” — dobijaš analizu ljudskim jezikom + tabelu jedan-pored-drugog."],
              ["4", "Ako želiš dublje: pokreni „Istraživanje” (povrede, srpske kvote, forumi) ili „AI konzilijum” (5 analitičara + sudija)."],
              ["5", "Kad odigraš tiket, klikni „Dodaj na tiket” — a posle meča obeleži ✓ (dobitak) ili ✗ (gubitak)."],
              ["6", "Profit, ROI, uspešnost i grafik kretanja bankrolla se sami računaju — vidiš tačno kako ti ide."],
            ].map(([n, t]) => (
              <li key={n} className="flex gap-2.5">
                <span className="shrink-0 h-5 w-5 rounded-full bg-accent text-accent-contrast text-[11px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-2.5">Rečnik — šta znače brojevi</p>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Edge (pp)", "Razlika između šanse po našem modelu i šanse koju implicira kvota, u procentnim poenima. +5pp = kvota je izdašnija nego što treba (dobro za tebe); −5pp = kladionica precenjuje igrača (loše)."],
              ["De-vig (fer kvota)", "Kladionica u kvote ugrađuje svoju maržu. De-vig je skidanje te marže da se vidi koliko tržište stvarno misli da su šanse."],
              ["Value bet", "Tiket kod kojeg je tvoja procena šanse veća od one koju kvota plaća. Jedino klađenje koje dugoročno može biti u plusu."],
              ["Kelly ulog", "Matematička formula koliko % bankrolla uložiti na osnovu veličine edge-a. Mi predlažemo ¼-Kelly (četvrtinu) — štiti od propasti kad model greši."],
              ["ROI", "Povraćaj na uloženo: profit podeljen ukupnim ulozima. +5% = na svakih 100 uloženih dinara vraća se 105."],
              ["Bankroll", "Ukupan novac odvojen isključivo za klađenje. Zlatno pravilo: iznos čiji te potpuni gubitak ne sme boleti."],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-semibold text-ink">{term}</dt>
                <dd className="text-ink-soft text-[13px] leading-relaxed">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <p className="mt-5 text-[11px] text-muted border-t border-line pt-3">
        Model trenutno <strong>nema dokazan edge</strong> protiv tržišta (vidi „Track record") — koristi sajt za praćenje,
        učenje i male uloge. 18+, klađenje je odgovornost korisnika.
      </p>
    </details>
  );
}
