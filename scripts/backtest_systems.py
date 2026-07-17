"""
Pravi backtest sistema tiketa na STVARNIM mečevima i STVARNIM kvotama.

Pitanje: da si igrao po sistemu (1 singl, 2 singla, kombinacija 2/3/4 para...) — kako bi prošao?

Pošteno poređenje: svaki sistem svakog dana rizikuje ISTI novac (2% bankrolla).
Razlikuje se samo FORMA tiketa. Tako se vidi šta forma sama po sebi radi.

Elo se gradi hronološki (walk-forward): za svaki meč se koristi samo rejting PRE tog meča.
"""
import pandas as pd
import json
import math
from pathlib import Path
from itertools import combinations

HERE = Path(__file__).parent
RAW = HERE / "raw"
YEARS = [2022, 2023, 2024, 2025, 2026]
K = 32
BASE_ELO = 1500
TEST_START = "2025-06-01"
START_BANKROLL = 10000.0
DAILY_RISK = 0.02      # 2% bankrolla dnevno — isto za svaki sistem
MIN_PROB = 0.60        # pick mora imati bar 60% po modelu
EDGE_THRESHOLD = 0.02

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

# Za svaki test-meč: ko je favorit po modelu, njegova kvota, i da li je pobedio.
picks = []

for _, row in df.iterrows():
    w, l, surface, date = row["Winner"], row["Loser"], row["Surface"], row["Date"]
    ow = row["PSW"] if pd.notna(row.get("PSW")) else row.get("AvgW")
    ol = row["PSL"] if pd.notna(row.get("PSL")) else row.get("AvgL")

    rw, rl = blend(w, surface), blend(l, surface)
    has_odds = pd.notna(ow) and pd.notna(ol) and ow > 1 and ol > 1

    if date >= pd.Timestamp(TEST_START) and has_odds:
        fav_is_w = rw >= rl
        p_fav = expected(rw, rl) if fav_is_w else expected(rl, rw)
        odds_fav = float(ow if fav_is_w else ol)
        odds_dog = float(ol if fav_is_w else ow)
        imp_f, imp_d = 1 / odds_fav, 1 / odds_dog
        market_p_fav = imp_f / (imp_f + imp_d)
        picks.append({
            "date": date.date().isoformat(),
            "p": float(p_fav),
            "odds": odds_fav,
            "won": bool(fav_is_w),          # da li je favorit po modelu pobedio
            "edge": float(p_fav - market_p_fav),
        })

    # update posle korišćenja (bez uvida u budućnost)
    ea = expected(get(elo, w), get(elo, l))
    elo[w] = get(elo, w) + K * (1 - ea)
    elo[l] = get(elo, l) + K * (0 - (1 - ea))
    es = expected(get(surf_elo, (w, surface)), get(surf_elo, (l, surface)))
    surf_elo[(w, surface)] = get(surf_elo, (w, surface)) + K * (1 - es)
    surf_elo[(l, surface)] = get(surf_elo, (l, surface)) + K * (0 - (1 - es))

print(f"Test pickova sa kvotama: {len(picks)}  ({picks[0]['date']} -> {picks[-1]['date']})")

# Grupiši po danu, sortiraj po sigurnosti modela
by_day = {}
for p in picks:
    by_day.setdefault(p["date"], []).append(p)
for d in by_day:
    by_day[d].sort(key=lambda x: -x["p"])

days = sorted(by_day.keys())


def simulate(name, kind, n, only_value=False, min_prob=MIN_PROB):
    """kind: 'singl' (n odvojenih tiketa) ili 'kombo' (1 tiket od n parova)."""
    bankroll = START_BANKROLL
    peak = bankroll
    max_dd = 0.0
    staked_total = 0.0
    tickets = 0
    wins = 0
    curve = []
    streak = 0
    worst_streak = 0

    for d in days:
        cands = [p for p in by_day[d] if p["p"] >= min_prob]
        if only_value:
            cands = [p for p in cands if p["edge"] > EDGE_THRESHOLD]
        if len(cands) < n:
            continue

        sel = cands[:n]
        budget = bankroll * DAILY_RISK
        if budget <= 0:
            break

        if kind == "singl":
            per = budget / n
            for s in sel:
                staked_total += per
                tickets += 1
                if s["won"]:
                    bankroll += per * (s["odds"] - 1)
                    wins += 1
                    streak = 0
                else:
                    bankroll -= per
                    streak += 1
                    worst_streak = max(worst_streak, streak)
        else:  # kombo — jedan tiket, svi parovi moraju proći
            total_odds = 1.0
            all_won = True
            for s in sel:
                total_odds *= s["odds"]
                if not s["won"]:
                    all_won = False
            staked_total += budget
            tickets += 1
            if all_won:
                bankroll += budget * (total_odds - 1)
                wins += 1
                streak = 0
            else:
                bankroll -= budget
                streak += 1
                worst_streak = max(worst_streak, streak)

        peak = max(peak, bankroll)
        dd = (peak - bankroll) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)
        curve.append(round(bankroll))

    pnl = bankroll - START_BANKROLL
    return {
        "name": name,
        "kind": kind,
        "legs": n,
        "finalBankroll": round(bankroll),
        "pnl": round(pnl),
        "roiPct": round((pnl / staked_total * 100), 2) if staked_total else 0.0,
        "tickets": tickets,
        "wins": wins,
        "winRatePct": round(wins / tickets * 100, 1) if tickets else 0.0,
        "maxDrawdownPct": round(max_dd * 100, 1),
        "worstLosingStreak": worst_streak,
        "totalStaked": round(staked_total),
        # kriva bankrolla — proređena na ~60 tačaka za grafik
        "curve": curve[:: max(1, len(curve) // 60)] if curve else [],
    }


systems = [
    simulate("1 singl dnevno (najsigurniji pick)", "singl", 1),
    simulate("2 singla dnevno (po 1%)", "singl", 2),
    simulate("3 singla dnevno (po 0.67%)", "singl", 3),
    simulate("Kombinacija 2 para", "kombo", 2),
    simulate("Kombinacija 3 para", "kombo", 3),
    simulate("Kombinacija 4 para", "kombo", 4),
    simulate("Samo value singlovi (edge>2pp)", "singl", 1, only_value=True, min_prob=0.5),
]

print(f"\n{'Sistem':<38} {'Tiketa':>7} {'Prolaz':>7} {'ROI':>8} {'Kraj':>9} {'MaxPad':>8} {'Niz-':>5}")
for s in systems:
    print(f"{s['name']:<38} {s['tickets']:>7} {s['winRatePct']:>6.1f}% {s['roiPct']:>7.2f}% {s['finalBankroll']:>9,} {s['maxDrawdownPct']:>7.1f}% {s['worstLosingStreak']:>5}")

best = max(systems, key=lambda s: s["roiPct"])
print(f"\nNajbolji po ROI: {best['name']} ({best['roiPct']}%)")

out = {
    "window": {"start": TEST_START, "end": days[-1] if days else None, "days": len(days)},
    "startBankroll": START_BANKROLL,
    "dailyRiskPct": DAILY_RISK * 100,
    "minProb": MIN_PROB,
    "picksTested": len(picks),
    "systems": systems,
    "bestByRoi": best["name"],
}
out_path = HERE.parent / "data" / "system_backtest.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nUpisano u {out_path}")
