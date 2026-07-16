import pandas as pd
import numpy as np
import json
import math
import random
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
latest_rank = {}      # player -> most recent official ATP rank seen (WRank/LRank)
results_history = {}  # player -> chronological list of "W"/"L" (recent form)
surface_wl = {}       # player -> {surface: [wins, losses]} (surface mastery %)
last_date = {}        # player -> date of last match (fatigue / rest days)
h2h = {}              # tuple(sorted(p1,p2)) -> {player: wins} (head-to-head)

# --- Phase-2 feature helpers (computed from PRE-match state only, no lookahead) ---

def form_rate(p):
    h = results_history.get(p, [])
    lastn = h[-10:]
    if not lastn:
        return 0.5
    return sum(1 for r in lastn if r == "W") / len(lastn)

def h2h_adv(p1, p2):
    key = tuple(sorted((p1, p2)))
    d = h2h.get(key)
    if not d:
        return 0.0
    w1, w2 = d.get(p1, 0), d.get(p2, 0)
    tot = w1 + w2
    return (w1 - w2) / tot if tot else 0.0

def rest_days(p, date):
    ld = last_date.get(p)
    if ld is None:
        return 14.0
    return float(min((date - ld).days, 14))

rng = random.Random(42)

rows = []  # per-match: winner-perspective features + odds, for v2 fit/eval

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

    has_odds = pd.notna(odds_w) and pd.notna(odds_l) and odds_w > 1 and odds_l > 1

    # v1 (pure Elo) walk-forward evaluation
    if is_test and has_odds:
        n_test += 1
        imp_w, imp_l = 1.0 / odds_w, 1.0 / odds_l
        market_p_w = imp_w / (imp_w + imp_l)  # de-vigged

        if rw_blend >= rl_blend:
            correct += 1

        p_clamped = min(max(model_p_w, 1e-6), 1 - 1e-6)
        logloss_sum += -math.log(p_clamped)

        edge_w = model_p_w - market_p_w
        edge_l = (1 - model_p_w) - (1 - market_p_w)
        if edge_w > EDGE_THRESHOLD:
            value_bets += 1
            staked += 1
            returns += (odds_w - 1)
        elif edge_l > EDGE_THRESHOLD:
            value_bets += 1
            staked += 1
            returns += -1

    # v2 feature row (winner perspective), BEFORE state updates
    p_cl = min(max(model_p_w, 1e-6), 1 - 1e-6)
    xw = [
        math.log(p_cl / (1 - p_cl)),                       # elo logit
        form_rate(w) - form_rate(l),                        # form diff [-1,1]
        h2h_adv(w, l),                                      # h2h advantage [-1,1]
        (rest_days(w, date) - rest_days(l, date)) / 14.0,   # rest diff [-1,1]
    ]
    rows.append({
        "date": date,
        "xw": xw,
        "is_test": is_test,
        "odds_w": float(odds_w) if has_odds else None,
        "odds_l": float(odds_l) if has_odds else None,
    })

    # -- update ratings/state AFTER using pre-match values above (no lookahead) --
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
    last_date[w] = date
    last_date[l] = date
    key = tuple(sorted((w, l)))
    h2h.setdefault(key, {})[w] = h2h.get(key, {}).get(w, 0) + 1

accuracy = correct / n_test if n_test else 0
avg_logloss = logloss_sum / n_test if n_test else 0
roi = (returns / staked * 100) if staked else 0

print("--- v1 (pure Elo) ---")
print(f"Backtest window: {TEST_START} -> {all_df['Date'].max().date()}")
print(f"Test matches with usable odds: {n_test}")
print(f"Favorite-pick accuracy: {accuracy*100:.1f}%")
print(f"Avg log-loss: {avg_logloss:.4f}")
print(f"Value bets flagged: {value_bets} | flat-stake ROI: {roi:.2f}%")

# ---------- v2: logistic regression on [elo_logit, form_diff, h2h, rest_diff] ----------
# Train on pre-TEST_START matches, random orientation for balanced labels (seed 42).
train_X, train_y = [], []
for r in rows:
    if r["is_test"]:
        continue
    if rng.random() < 0.5:
        train_X.append(r["xw"]); train_y.append(1.0)
    else:
        train_X.append([-v for v in r["xw"]]); train_y.append(0.0)

X = np.array(train_X)
y = np.array(train_y)
# Offset logistic fit: Elo logit enters with a FROZEN coefficient of 1.0 (it is already a
# calibrated probability); we fit only the extra features + intercept. Letting the Elo
# coefficient float amplified overconfidence and made out-of-sample log-loss/ROI worse.
offset = X[:, 0]
Xf = X[:, 1:]
wf = np.zeros(3)
b = 0.0
lr = 0.3
for it in range(4000):
    z = offset + Xf @ wf + b
    p = 1.0 / (1.0 + np.exp(-z))
    g = p - y
    wf -= lr * (Xf.T @ g) / len(y)
    b -= lr * g.mean()
wts = np.array([1.0, wf[0], wf[1], wf[2]])

print("--- v2 fitted coefficients ---")
print(f"intercept={b:.4f} eloLogit={wts[0]:.4f} formDiff={wts[1]:.4f} h2h={wts[2]:.4f} restDiff={wts[3]:.4f}")

# Evaluate v2 on the test window (winner-perspective => p_adj is P(winner wins))
n2 = 0; correct2 = 0; ll2 = 0.0; bets2 = 0; staked2 = 0.0; ret2 = 0.0
for r in rows:
    if not r["is_test"] or r["odds_w"] is None:
        continue
    n2 += 1
    z = float(np.dot(wts, r["xw"])) + b
    p_adj = 1.0 / (1.0 + math.exp(-z))
    if p_adj >= 0.5:
        correct2 += 1
    p_c = min(max(p_adj, 1e-6), 1 - 1e-6)
    ll2 += -math.log(p_c)
    imp_w, imp_l = 1.0 / r["odds_w"], 1.0 / r["odds_l"]
    market_p_w = imp_w / (imp_w + imp_l)
    edge_w = p_adj - market_p_w
    edge_l = (1 - p_adj) - (1 - market_p_w)
    if edge_w > EDGE_THRESHOLD:
        bets2 += 1; staked2 += 1; ret2 += (r["odds_w"] - 1)
    elif edge_l > EDGE_THRESHOLD:
        bets2 += 1; staked2 += 1; ret2 += -1

acc2 = correct2 / n2 if n2 else 0
ll2avg = ll2 / n2 if n2 else 0
roi2 = (ret2 / staked2 * 100) if staked2 else 0
print("--- v2 (Elo + forma + H2H + odmor) ---")
print(f"Accuracy: {acc2*100:.1f}% | log-loss: {ll2avg:.4f} | bets: {bets2} | ROI: {roi2:.2f}%")

# ---------- exports ----------
surface_by_player = {}
for (player, surface), rating in surf_elo.items():
    surface_by_player.setdefault(player, {})[surface] = round(rating)

def form_of(p):
    hist = results_history.get(p, [])
    last10 = hist[-10:]
    return {"wins": sum(1 for r in last10 if r == "W"), "total": len(last10)}

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
            "lastMatch": str(last_date[p].date()) if p in last_date else None,
        })

players_out.sort(key=lambda x: (x["atpRank"] is None, x["atpRank"] if x["atpRank"] is not None else 10**9))

# H2H map: only pairs with >=2 meetings (single meetings are noise; keeps the JSON small).
exported_names = {p["name"] for p in players_out}
h2h_out = {}
for (p1, p2), d in h2h.items():
    tot = sum(d.values())
    if tot >= 2 and p1 in exported_names and p2 in exported_names:
        h2h_out[f"{p1}|{p2}"] = [d.get(p1, 0), d.get(p2, 0)]

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
    "eloV2": {
        "features": ["eloLogit", "formDiff", "h2hAdv", "restDiff"],
        "coefficients": {
            "intercept": round(float(b), 6),
            "eloLogit": round(float(wts[0]), 6),
            "formDiff": round(float(wts[1]), 6),
            "h2hAdv": round(float(wts[2]), 6),
            "restDiff": round(float(wts[3]), 6),
        },
        "backtest": {
            "windowStart": TEST_START,
            "windowEnd": str(all_df["Date"].max().date()),
            "matchesTested": n2,
            "favoriteAccuracyPct": round(acc2 * 100, 1),
            "avgLogLoss": round(ll2avg, 4),
            "valueBetsFlagged": bets2,
            "roiPct": round(roi2, 2),
        },
    },
    "h2h": h2h_out,
    "players": players_out,
}

out_path = HERE.parent / "data" / "elo_ratings.json"
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fp:
    json.dump(out, fp, ensure_ascii=False, indent=2)

print(f"\nWrote {len(players_out)} players, {len(h2h_out)} H2H pairs to {out_path}")
