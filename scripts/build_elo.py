import pandas as pd
import numpy as np
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
YEARS = [2022, 2023, 2024, 2025, 2026]
K = 32
BASE_ELO = 1500
TEST_START = "2025-06-01"  # walk-forward backtest window: last ~13 months, out-of-sample
EDGE_THRESHOLD = 0.02       # flag as "value bet" if model prob exceeds Pinnacle-implied prob by >2pp

frames = []
for y in YEARS:
    f = RAW / f"atp_{y}.xlsx"
    if f.exists():
        df = pd.read_excel(f)
        frames.append(df)

all_df = pd.concat(frames, ignore_index=True)
all_df["Date"] = pd.to_datetime(all_df["Date"], errors="coerce")
all_df = all_df.dropna(subset=["Date", "Winner", "Loser", "Surface"])
all_df = all_df.sort_values(["Date", "ATP", "Round"], kind="stable").reset_index(drop=True)

print(f"Total matches loaded: {len(all_df)}  ({all_df['Date'].min().date()} -> {all_df['Date'].max().date()})")

elo = {}
surf_elo = {}

def get_elo(d, key, default=BASE_ELO):
    return d.get(key, default)

def expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))

def blended_rating(player, surface):
    o = get_elo(elo, player)
    s = get_elo(surf_elo, (player, surface))
    return 0.5 * o + 0.5 * s

matches_played = {}
latest_rank = {}  # player -> most recent official ATP rank seen (WRank/LRank), chronological last-seen-wins
results_history = {}  # player -> chronological list of "W"/"L" (Phase 2: recent form)
surface_wl = {}  # player -> {surface: [wins, losses]} (Phase 2: surface mastery %)

test_rows = []
n_total = 0
n_test = 0
correct = 0
logloss_sum = 0.0
value_bets = 0
staked = 0.0
returns = 0.0

for _, row in all_df.iterrows():
    w, l, surface, date = row["Winner"], row["Loser"], row["Surface"], row["Date"]
    psw, psl = row.get("PSW"), row.get("PSL")
    avgw, avgl = row.get("AvgW"), row.get("AvgL")
    odds_w = psw if pd.notna(psw) else avgw
    odds_l = psl if pd.notna(psl) else avgl

    rw_blend = blended_rating(w, surface)
    rl_blend = blended_rating(l, surface)
    model_p_w = expected(rw_blend, rl_blend)

    is_test = date >= pd.Timestamp(TEST_START)
    n_total += 1

    if is_test and pd.notna(odds_w) and pd.notna(odds_l) and odds_w > 1 and odds_l > 1:
        n_test += 1
        imp_w, imp_l = 1.0 / odds_w, 1.0 / odds_l
        market_p_w = imp_w / (imp_w + imp_l)  # de-vigged

        predicted_winner_is_w = rw_blend >= rl_blend
        if predicted_winner_is_w:
            correct += 1

        p_clamped = min(max(model_p_w, 1e-6), 1 - 1e-6)
        logloss_sum += -math.log(p_clamped)  # actual outcome is always "w won"

        edge_w = model_p_w - market_p_w
        edge_l = (1 - model_p_w) - (1 - market_p_w)
        if edge_w > EDGE_THRESHOLD:
            value_bets += 1
            staked += 1
            returns += (odds_w - 1)  # w won -> this bet wins
        elif edge_l > EDGE_THRESHOLD:
            value_bets += 1
            staked += 1
            returns += -1  # backed the loser -> bet loses

    # -- update ratings AFTER using pre-match values above (no lookahead) --
    ea = expected(get_elo(elo, w), get_elo(elo, l))
    elo[w] = get_elo(elo, w) + K * (1 - ea)
    elo[l] = get_elo(elo, l) + K * (0 - (1 - ea))

    esa = expected(get_elo(surf_elo, (w, surface)), get_elo(surf_elo, (l, surface)))
    surf_elo[(w, surface)] = get_elo(surf_elo, (w, surface)) + K * (1 - esa)
    surf_elo[(l, surface)] = get_elo(surf_elo, (l, surface)) + K * (0 - (1 - esa))

    matches_played[w] = matches_played.get(w, 0) + 1
    matches_played[l] = matches_played.get(l, 0) + 1

    wrank, lrank = row.get("WRank"), row.get("LRank")
    if pd.notna(wrank):
        latest_rank[w] = int(wrank)
    if pd.notna(lrank):
        latest_rank[l] = int(lrank)

    results_history.setdefault(w, []).append("W")
    results_history.setdefault(l, []).append("L")
    surface_wl.setdefault(w, {}).setdefault(surface, [0, 0])[0] += 1
    surface_wl.setdefault(l, {}).setdefault(surface, [0, 0])[1] += 1

accuracy = correct / n_test if n_test else 0
avg_logloss = logloss_sum / n_test if n_test else 0
roi = (returns / staked * 100) if staked else 0

print(f"Backtest window: {TEST_START} -> {all_df['Date'].max().date()}")
print(f"Test matches with usable odds: {n_test}")
print(f"Favorite-pick accuracy: {accuracy*100:.1f}%")
print(f"Avg log-loss: {avg_logloss:.4f}")
print(f"Value bets flagged (edge > {EDGE_THRESHOLD*100:.0f}pp vs Pinnacle): {value_bets}")
print(f"Flat-stake ROI on flagged value bets: {roi:.2f}%")

surface_by_player = {}
for (player, surface), rating in surf_elo.items():
    surface_by_player.setdefault(player, {})[surface] = round(rating)

def form_of(p):
    hist = results_history.get(p, [])
    last10 = hist[-10:]
    return {"wins": last10.count("W"), "total": len(last10)}

def surface_record_of(p):
    rec = {}
    for surf, (wv, lv) in surface_wl.get(p, {}).items():
        tot = wv + lv
        rec[surf] = {"wins": wv, "losses": lv, "pct": round(wv / tot * 100, 1) if tot else 0.0}
    return rec

players_out = []
for p, rating in elo.items():
    if matches_played.get(p, 0) >= 1:
        players_out.append({
            "name": p,
            "elo": round(rating),
            "matches": matches_played.get(p, 0),
            "surfaceElo": surface_by_player.get(p, {}),
            "atpRank": latest_rank.get(p),
            "form": form_of(p),
            "surfaceRecord": surface_record_of(p),
        })

players_out.sort(key=lambda x: (x["atpRank"] is None, x["atpRank"] if x["atpRank"] is not None else 10**9))

out = {
    "generatedFrom": "tennis-data.co.uk ATP results + odds, 2022-2026",
    "matchesUsed": int(n_total),
    "dateRange": [str(all_df["Date"].min().date()), str(all_df["Date"].max().date())],
    "eloModel": {"kFactor": K, "baseRating": BASE_ELO, "blend": "50% overall Elo + 50% surface Elo"},
    "backtest": {
        "windowStart": TEST_START,
        "windowEnd": str(all_df["Date"].max().date()),
        "matchesTested": n_test,
        "favoriteAccuracyPct": round(accuracy * 100, 1),
        "avgLogLoss": round(avg_logloss, 4),
        "edgeThresholdPct": EDGE_THRESHOLD * 100,
        "valueBetsFlagged": value_bets,
        "roiPct": round(roi, 2),
        "referenceOdds": "Pinnacle (PSW/PSL), de-vigged; Avg odds as fallback",
    },
    "players": players_out,
}

out_path = HERE.parent / "data" / "elo_ratings.json"
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fp:
    json.dump(out, fp, ensure_ascii=False, indent=2)

print(f"\nWrote {len(players_out)} active players to {out_path}")
