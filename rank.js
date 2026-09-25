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

  let action = "WAIT";
  let invest = "Abhi nahi";
  let verdict = "Signal mix hai. Jab tak 5m aur 1h dono buyers ke saath na hon, paisa mat lagao.";

  if (thin || (tooNew && liq < 40000)) {
    action = "AVOID";
    invest = "Nahi";
    verdict = "Isme invest mat karo. Liquidity ya age itni kam hai ki exit ke time price gir sakta hai.";
  } else if (dumping && sellHeavy) {
    action = "AVOID";
    invest = "Nahi";
    verdict = "Dump chal raha hai. Girte hue ko pakadne ki koshish mat karo.";
  } else if (fading || (pc.h24 >= 80 && pc.h1 < 0 && h1.ratio < 1)) {
    action = "EXIT";
    invest = "Nayi entry nahi";
    verdict = "Agar position hai to exit lo. Upar ja chuka hai aur ab buyers kamzor pad rahe hain.";
  } else if (blowoff && pc.m5 > 0) {
    action = "WAIT";
    invest = "Abhi nahi — chase mat karo";
    verdict = "Move already stretch ho chuka hai. Itne upar se entry lene par exit jaldi chahiye, reward kharab hai.";
  } else if (steadyUp && buyPressure && live && liq >= 25000 && !tooNew) {
    action = "ENTER";
    invest = "Haan, sirf chhota size";
    verdict = "Yeh abhi ka sabse saaf setup hai. Poori capital nahi — capital ka 1% se 2% tak, stop ke saath.";
  } else if (pc.h1 > 0 && h1.ratio >= 1 && liq >= 25000 && !deadBook) {
    action = "HOLD";
    invest = "Naya add mat karo";
    verdict = "Agar pehle se kharida hai to hold kar sakte ho. Fresh entry ke liye 5m buys aur tez hone do.";
  } else if (deadBook) {
    action = "WAIT";
    invest = "Abhi nahi";
    verdict = "Chart so raha hai. Volume ke bina entry lene ka fayda nahi.";
  }

  let score = 48;
  if (liq >= 25000) score += 8;
  if (liq >= 80000) score += 8;
  if (liq >= 250000) score += 4;
  if (liq < 15000) score -= 22;
  const vlr = liq > 0 ? vol24 / liq : 0;
  if (vlr >= 0.5 && vlr <= 6) score += 8;
  if (vlr > 18) score -= 6;
  if (h1.ratio >= 1.35 && h1.buys >= 10) score += 12;
  else if (h1.ratio < 0.7 && h1.sells >= 8) score -= 14;
  if (m5.ratio >= 1.15 && m5.buys + m5.sells >= 6) score += 6;
  if (pc.h1 > 0 && pc.h1 < 35) score += 8;
  if (pc.h1 >= 80) score -= 10;
  if (pc.m5 <= -8) score -= 8;
  if (pc.h6 <= -40) score -= 10;
  if (ageMin != null && ageMin >= 90 && ageMin <= 60 * 24 * 10) score += 6;
  if (tooNew) score -= 12;
  if (vol1 >= 20000) score += 4;
  score = Math.max(1, Math.min(99, Math.round(score)));

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
    .sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || b.score - a.score);
}

function pickBest(coins) {
  return (
    coins.find((coin) => coin.action === "ENTER") ||
    coins.find((coin) => coin.action === "HOLD") ||
    coins[0] ||
    null
  );
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

window.rankPairs=rankPairs;
window.pickBest=pickBest;
})();
