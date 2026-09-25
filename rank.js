(function(){
const MAJORS = new Set([
  "SOL",
  "WSOL",
  "ETH",
  "WETH",
  "BTC",
  "WBTC",
  "BNB",
  "WBNB",
  "USDC",
  "USDT",
  "USD1",
  "DAI",
  "BUSD",
]);

const ACTION_ORDER = { ENTER: 0, HOLD: 1, WAIT: 2, EXIT: 3, AVOID: 4 };

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function txnWindow(window) {
  const buys = window?.buys ?? 0;
  const sells = window?.sells ?? 0;
  const ratio = sells === 0 ? (buys > 0 ? 3 : 1) : buys / sells;
  return { buys, sells, ratio };
}

function fmtPx(value) {
  const n = num(value);
  if (n === 0) return "$0";
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  const digits = Math.min(10, Math.max(4, Math.ceil(-Math.log10(n)) + 2));
  return `$${n.toFixed(digits)}`;
}

function analyze(pair, now) {
  const liq = num(pair.liquidity?.usd);
  const mc = num(pair.marketCap) || num(pair.fdv);
  const vol24 = num(pair.volume?.h24);
  const vol1 = num(pair.volume?.h1);
  const vol5 = num(pair.volume?.m5);
  const pc = {
    m5: num(pair.priceChange?.m5),
    h1: num(pair.priceChange?.h1),
    h6: num(pair.priceChange?.h6),
    h24: num(pair.priceChange?.h24),
  };
  const m5 = txnWindow(pair.txns?.m5);
  const h1 = txnWindow(pair.txns?.h1);
  const h6 = txnWindow(pair.txns?.h6);
  const ageMin = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : null;
  const price = num(pair.priceUsd);
  const why = [];

  if (liq >= 80000) why.push(`Liquidity ${fmtUsd(liq)} — nikalna relatively aasaan hai`);
  else if (liq >= 20000) why.push(`Liquidity ${fmtUsd(liq)} — chhote size ke liye theek, bada order slip karega`);
  else why.push(`Liquidity sirf ${fmtUsd(liq)} — exit mushkil, rug risk high`);

  if (h1.buys + h1.sells > 0) {
    why.push(`1h flow: ${h1.buys} buys / ${h1.sells} sells`);
  }
  if (m5.buys + m5.sells > 0) {
    why.push(`5m flow: ${m5.buys} buys / ${m5.sells} sells, price ${signed(pc.m5)}`);
  }
  why.push(`Price: 5m ${signed(pc.m5)} · 1h ${signed(pc.h1)} · 24h ${signed(pc.h24)}`);
  if (ageMin != null) why.push(`Pair age: ${fmtAge(ageMin)}`);

  const tooNew = ageMin != null && ageMin < 25;
  const thin = liq < 12000;
  const deadBook = vol1 < 1500 && vol5 < 400;
  const sellHeavy = h1.sells >= 8 && h1.ratio < 0.75;
  const dumping = pc.h1 <= -15 || (pc.h6 <= -35 && pc.h1 < 0);
  const fading = pc.h1 >= 12 && pc.m5 <= -4 && m5.ratio < 1;
  const blowoff = pc.h1 >= 70 || pc.m5 >= 28 || pc.h24 >= 250;
  const buyPressure = h1.ratio >= 1.2 && h1.buys >= 8;
  const live = vol1 >= 8000 && m5.buys + m5.sells >= 4;
  const steadyUp = pc.m5 > -1 && pc.h1 > 0 && pc.h1 < 45 && pc.h6 > -15;

  const score = qualityScore({
    liq,
    vol1,
    vol5,
    vol24,
    pc,
    m5,
    h1,
    ageMin,
    tooNew,
    thin,
    dumping,
    sellHeavy,
    fading,
    blowoff,
    deadBook,
  });
  const quality = scoreGrade(score);

  let action = "WAIT";
  let invest = "Abhi nahi";
  let verdict = "Signal mix hai. Score 85+ ke bina best-quality entry nahi maanna.";

  if (thin || (tooNew && liq < 40000) || score <= 12) {
    action = "AVOID";
    invest = "Nahi";
    verdict = `Score ${score}. Yeh quality nahi hai — score 1 jaisi list mein yeh avoid hai.`;
  } else if (dumping && sellHeavy) {
    action = "AVOID";
    invest = "Nahi";
    verdict = `Score ${score}. Dump chal raha hai. Girte hue ko pakadne ki koshish mat karo.`;
  } else if (fading || (pc.h24 >= 80 && pc.h1 < 0 && h1.ratio < 1)) {
    action = "EXIT";
    invest = "Nayi entry nahi";
    verdict = `Score ${score}. Agar position hai to exit lo. Buyers kamzor pad rahe hain.`;
  } else if (blowoff && pc.m5 > 0) {
    action = "WAIT";
    invest = "Abhi nahi — chase mat karo";
    verdict = `Score ${score}. Move stretch ho chuka hai. Elite entry nahi hai.`;
  } else if (steadyUp && buyPressure && live && liq >= 40000 && !tooNew && score >= 68) {
    action = "ENTER";
    invest = "Haan, sirf chhota size";
    verdict = `Entry · score ${score}. Poori capital nahi — 1% se 2% tak, stop ke saath.`;
  } else if (pc.h1 > 0 && h1.ratio >= 1 && liq >= 25000 && !deadBook && score >= 60) {
    action = "HOLD";
    invest = "Naya add mat karo";
    verdict = `Hold · score ${score}. Agar pehle se hai to hold. Fresh entry alag se upar dikhegi.`;
  } else if (deadBook || score < 45) {
    action = "WAIT";
    invest = "Abhi nahi";
    verdict = `Score ${score}. Best quality nahi. Volume aur buyers ke bina entry mat lo.`;
  } else {
    verdict = `Score ${score}. Theek-thaak coin hai, elite signal nahi.`;
  }

  const stop = price * 0.85;
  const target1 = price * 1.25;
  const target2 = price * 1.55;
  const exitWhen = [
    `Hard stop: ${fmtPx(stop)} (entry se lagbhag -15%). Iske neeche hold mat karna.`,
    `Pehla exit: ${fmtPx(target1)} (+25%) par aadhi quantity bech do.`,
    `Doosra exit: ${fmtPx(target2)} (+55%) par aur 30% bech do.`,
    "Bacha hua hissa tab nikaalo jab price apne high se 15% gir jaye.",
    "5 minute mein sells buys se zyada ho jayein aur price red ho, to baaki turant exit.",
    `Liquidity ${fmtUsd(liq)} se 30% se zyada gir jaye to market order se nikal jao.`,
  ];

  if (action === "EXIT" || action === "AVOID") {
    exitWhen.unshift("Nayi buying nahi. Jo quantity hai use inme se jo pehle trigger ho us par bech do.");
  }

  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    url: pair.url,
    pairAddress: pair.pairAddress,
    address: pair.baseToken.address,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    image: pair.info?.imageUrl || null,
    priceUsd: price,
    liquidityUsd: liq,
    marketCap: mc,
    volume: { m5: vol5, h1: vol1, h24: vol24 },
    priceChange: pc,
    txns: {
      m5: { buys: m5.buys, sells: m5.sells },
      h1: { buys: h1.buys, sells: h1.sells },
      h6: { buys: h6.buys, sells: h6.sells },
    },
    ageMin,
    pairCreatedAt: pair.pairCreatedAt || null,
    action,
    score,
    quality,
    invest,
    verdict,
    why: why.slice(0, 5),
    exitWhen,
    levels: {
      stop,
      target1,
      target2,
    },
  };
}

function rankPairs(pairs, now = Date.now()) {
  const best = new Map();
  for (const pair of pairs) {
    const symbol = String(pair?.baseToken?.symbol || "").toUpperCase();
    const address = pair?.baseToken?.address;
    if (!pair?.chainId || !address || MAJORS.has(symbol)) continue;
    const key = `${pair.chainId}:${address}`;
    const prev = best.get(key);
    if (!prev || num(pair.liquidity?.usd) > num(prev.liquidity?.usd)) best.set(key, pair);
  }
  return [...best.values()]
    .map((pair) => analyze(pair, now))
    .sort((a, b) => b.score - a.score || ACTION_ORDER[a.action] - ACTION_ORDER[b.action]);
}

function pickBest(coins) {
  return (
    coins.find((coin) => coin.action === "ENTER") ||
    coins.find((coin) => coin.action === "HOLD") ||
    coins[0] ||
    null
  );
}

function qualityScore(input) {
  const { liq, vol1, vol24, pc, m5, h1, ageMin, tooNew, thin, dumping, sellHeavy, fading, blowoff, deadBook } = input;
  let liqPts = 0;
  if (liq >= 500000) liqPts = 18;
  else if (liq >= 150000) liqPts = 15;
  else if (liq >= 80000) liqPts = 11;
  else if (liq >= 40000) liqPts = 7;
  else if (liq >= 20000) liqPts = 4;
  else if (liq >= 12000) liqPts = 2;

  const samples = h1.buys + h1.sells;
  let flowPts = 0;
  if (samples >= 80 && h1.ratio >= 1.8) flowPts = 24;
  else if (samples >= 40 && h1.ratio >= 1.45) flowPts = 16;
  else if (samples >= 20 && h1.ratio >= 1.2) flowPts = 9;
  else if (samples >= 8 && h1.ratio >= 1) flowPts = 4;
  if (m5.buys + m5.sells >= 12 && m5.ratio >= 1.35) flowPts += 4;
  if (sellHeavy) flowPts = Math.min(flowPts, 3);

  let momPts = 0;
  if (pc.h1 >= 3 && pc.h1 <= 18 && pc.m5 > -1 && pc.m5 < 10 && pc.h6 > -8) momPts = 24;
  else if (pc.h1 > 0 && pc.h1 <= 35 && pc.m5 > -2) momPts = 12;
  else if (pc.h1 > 35 && pc.h1 < 70) momPts = 6;
  if (blowoff || fading) momPts = Math.min(momPts, 3);
  if (pc.h1 <= -10) momPts = 0;

  let volPts = 0;
  if (vol1 >= 100000) volPts = 16;
  else if (vol1 >= 30000) volPts = 11;
  else if (vol1 >= 8000) volPts = 6;
  else if (vol1 >= 2500) volPts = 3;
  const vlr = liq > 0 ? vol24 / liq : 99;
  if (vlr > 20 || vlr < 0.15) volPts = Math.max(0, volPts - 4);
  if (deadBook) volPts = 0;

  let safePts = 4;
  if (ageMin != null && ageMin >= 180 && ageMin <= 60 * 24 * 21) safePts = 14;
  else if (ageMin != null && ageMin >= 90) safePts = 8;
  if (tooNew) safePts = 0;
  if (thin || dumping) safePts = 0;

  let score = liqPts + Math.min(flowPts, 28) + momPts + volPts + safePts;
  if (liq < 3000) score = 1;
  else if (liq < 8000 && (deadBook || dumping)) score = Math.min(score, 4);
  else if (thin) score = Math.min(score, 14);
  else if (dumping && sellHeavy) score = Math.min(score, 10);
  else if (tooNew && liq < 40000) score = Math.min(score, 22);
  else if (blowoff) score = Math.min(score, 58);
  return Math.max(1, Math.min(99, Math.round(score)));
}

function scoreGrade(score) {
  if (score >= 85) return "Elite";
  if (score >= 70) return "Strong";
  if (score >= 45) return "Average";
  if (score >= 15) return "Weak";
  return "Junk";
}

function signed(value) {
  const n = num(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtUsd(value) {
  const n = num(value);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAge(minutes) {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "unknown";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

{ fmtPx };

window.rankPairs=rankPairs;
window.pickBest=pickBest;
})();
