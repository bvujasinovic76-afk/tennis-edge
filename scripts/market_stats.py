"""
Stvarna istorijska prolaznost dodatnih tipova (ne procena!):
- favorit pobedjuje
- favorit uzima bar jedan set
- autsajder uzima bar jedan set
- ukupno gemova preko/ispod 21.5 i 22.5

Racuna se iz rezultata po setovima svih Bo3 meceva (2022-2026), grupisano po
jacini favorita PO NASEM MODELU (pre-match, hronoloski — bez uvida u buducnost).
Tako tip "favorit uzima set" dobija pravu prolaznost za bas takve meceve.
"""
import pandas as pd
import json
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
YEARS = [2022, 2023, 2024, 2025, 2026]
K = 32
BASE_ELO = 1500

frames = []
for y in YEARS:
    f = RAW / f"atp_{y}.xlsx"
    if f.exists():
        frames.append(pd.read_excel(f))

df = pd.concat(frames, ignore_index=True)
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df = df.dropna(subset=["Date", "Winner", "Loser", "Surface"])
df = df.sort_values(["Date", "ATP", "Round"], kind="stable").reset_index(drop=True)

elo, surf_elo = {}, {}
get = lambda d, k: d.get(k, BASE_ELO)
expected = lambda ra, rb: 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))
blend = lambda p, s: 0.5 * get(elo, p) + 0.5 * get(surf_elo, (p, s))

# Bandovi jacine favorita po modelu
BANDS = [(0.50, 0.55), (0.55, 0.60), (0.60, 0.65), (0.65, 0.70), (0.70, 0.75), (0.75, 0.80), (0.80, 0.85), (0.85, 1.01)]
stats = [{"lo": lo, "hi": hi, "n": 0, "favWin": 0, "favSet": 0, "dogSet": 0, "over215": 0, "over225": 0, "gamesSum": 0} for lo, hi in BANDS]

skipped_bo5 = 0
for _, row in df.iterrows():
    w, l, surface = row["Winner"], row["Loser"], row["Surface"]

    rw, rl = blend(w, surface), blend(l, surface)
    fav_is_w = rw >= rl
    p_fav = expected(rw, rl) if fav_is_w else expected(rl, rw)

    # update PRE koriscenja u statistici? Ne — koristimo pre-match vrednosti, pa update ide POSLE (dole).
    bo3 = row.get("Best of") == 3
    completed = str(row.get("Comment", "")).strip().lower() == "completed"
    wsets = row.get("Wsets")
    lsets = row.get("Lsets")

    if bo3 and completed and pd.notna(wsets) and pd.notna(lsets):
        fav_sets = wsets if fav_is_w else lsets
        dog_sets = lsets if fav_is_w else wsets
        games = 0.0
        ok = True
        for a, b in (("W1", "L1"), ("W2", "L2"), ("W3", "L3")):
            va, vb = row.get(a), row.get(b)
            if pd.notna(va) and pd.notna(vb):
                games += float(va) + float(vb)
        if games > 0:
            for s in stats:
                if s["lo"] <= p_fav < s["hi"]:
                    s["n"] += 1
                    s["favWin"] += 1 if fav_is_w else 0
                    s["favSet"] += 1 if fav_sets >= 1 else 0
                    s["dogSet"] += 1 if dog_sets >= 1 else 0
                    s["over215"] += 1 if games >= 22 else 0
                    s["over225"] += 1 if games >= 23 else 0
                    s["gamesSum"] += games
                    break
    elif not bo3:
        skipped_bo5 += 1

    # hronoloski update (bez lookahead-a)
    ea = expected(get(elo, w), get(elo, l))
    elo[w] = get(elo, w) + K * (1 - ea)
    elo[l] = get(elo, l) + K * (0 - (1 - ea))
    es = expected(get(surf_elo, (w, surface)), get(surf_elo, (l, surface)))
    surf_elo[(w, surface)] = get(surf_elo, (w, surface)) + K * (1 - es)
    surf_elo[(l, surface)] = get(surf_elo, (l, surface)) + K * (0 - (1 - es))

out_bands = []
print(f"{'Band':>10} {'N':>5} {'FavWin':>7} {'FavSet':>7} {'DogSet':>7} {'O21.5':>6} {'O22.5':>6} {'AvgGem':>7}")
for s in stats:
    if s["n"] == 0:
        continue
    n = s["n"]
    b = {
        "lo": s["lo"],
        "hi": s["hi"],
        "n": n,
        "favWinPct": round(s["favWin"] / n * 100, 1),
        "favSetPct": round(s["favSet"] / n * 100, 1),
        "dogSetPct": round(s["dogSet"] / n * 100, 1),
        "over215Pct": round(s["over215"] / n * 100, 1),
        "over225Pct": round(s["over225"] / n * 100, 1),
        "avgGames": round(s["gamesSum"] / n, 1),
    }
    out_bands.append(b)
    print(f"{int(s['lo']*100):>4}-{int(s['hi']*100):<4} {n:>5} {b['favWinPct']:>6.1f}% {b['favSetPct']:>6.1f}% {b['dogSetPct']:>6.1f}% {b['over215Pct']:>5.1f}% {b['over225Pct']:>5.1f}% {b['avgGames']:>7.1f}")

out = {
    "generatedFrom": "tennis-data.co.uk ATP Bo3 completed matches 2022-2026, pre-match model bands (chronological)",
    "note": "Prolaznosti su STVARNE istorijske frekvencije, ne procene. Kvote za ove tipove nemamo u podacima — u aplikaciji su procena od fer kvote.",
    "bands": out_bands,
}
out_path = HERE.parent / "data" / "market_stats.json"
with open(out_path, "w", encoding="utf-8") as fp:
    json.dump(out, fp, ensure_ascii=False, indent=2)
print(f"\nUpisano u {out_path} (preskoceno Bo5: {skipped_bo5})")
