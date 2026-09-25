const CHAINS = [
  ["all", "Sab chains"],
  ["solana", "Solana"],
  ["bsc", "BSC"],
  ["ethereum", "Ethereum"],
  ["base", "Base"],
];
const ACTIONS = ["ALL", "ENTER", "HOLD", "WAIT", "EXIT", "AVOID"];
const ACTION_HI = {
  ENTER: "Entry",
  HOLD: "Hold",
  WAIT: "Ruko",
  EXIT: "Exit",
  AVOID: "Door raho",
};

const state = {
  coins: [],
  best: null,
  updatedAt: 0,
  chain: "all",
  action: "ALL",
  search: "",
  openKey: null,
  trails: new Map(),
  session: new Map(),
};

const hero = document.querySelector("#hero");
const list = document.querySelector("#list");
const drawer = document.querySelector("#drawer");
const toast = document.querySelector("#toast");
const liveLabel = document.querySelector("#live-label");
const chains = document.querySelector("#chains");
const actions = document.querySelector("#actions");
const clearBtn = document.querySelector("#clear-search");

chains.innerHTML = CHAINS.map(
  ([id, label]) => `<button type="button" data-chain="${id}" class="${id === "all" ? "on" : ""}">${label}</button>`,
).join("");
actions.innerHTML = ACTIONS.map(
  (id) => `<button type="button" data-action="${id}" class="${id === "ALL" ? "on" : ""}">${id === "ALL" ? "Sab signals" : ACTION_HI[id]}</button>`,
).join("");

chains.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.chain = button.dataset.chain;
  for (const node of chains.querySelectorAll("button")) node.classList.toggle("on", node === button);
  render();
});

actions.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.action = button.dataset.action;
  for (const node of actions.querySelectorAll("button")) node.classList.toggle("on", node === button);
  render();
});

document.querySelector("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = document.querySelector("#search").value.trim();
  if (q.length < 2) return;
  state.search = q;
  clearBtn.hidden = false;
  await load();
});

clearBtn.addEventListener("click", async () => {
  state.search = "";
  document.querySelector("#search").value = "";
  clearBtn.hidden = true;
  await load();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open]");
  if (!button) return;
  openCoin(button.dataset.open);
});

hero.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open]");
  if (button) openCoin(button.dataset.open);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

function keyOf(coin) {
  return `${coin.chainId}:${coin.address}`;
}

function fmtUsd(value) {
  const n = Number(value) || 0;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPx(value) {
  const n = Number(value) || 0;
  if (n === 0) return "$0";
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  const digits = Math.min(10, Math.max(4, Math.ceil(-Math.log10(n)) + 2));
  return `$${n.toFixed(digits)}`;
}

function signed(value) {
  const n = Number(value) || 0;
  return `<b class="${n >= 0 ? "up" : "down"}">${n > 0 ? "+" : ""}${n.toFixed(1)}%</b>`;
}

function age(minutes) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function visibleCoins() {
  return state.coins.filter((coin) => {
    if (state.chain !== "all" && coin.chainId !== state.chain) return false;
    if (state.action !== "ALL" && coin.action !== state.action) return false;
    return true;
  });
}

function track(coins) {
  const watched = new Set(JSON.parse(localStorage.getItem("nazar-watch") || "[]"));
  for (const coin of coins) {
    const key = keyOf(coin);
    const prev = state.session.get(key);
    const price = coin.priceUsd;
    if (!prev) {
      state.session.set(key, { open: price, high: price, action: coin.action });
    } else {
      prev.high = Math.max(prev.high, price);
      if (watched.has(key) && prev.action !== "EXIT" && coin.action === "EXIT") {
        showToast(`${coin.symbol}: signal EXIT ho gaya. Position ho to nikalne ka time.`);
      } else if (watched.has(key) && prev.high > 0 && price <= prev.high * 0.85 && price < prev.open) {
        showToast(`${coin.symbol}: session high se 15% neeche. Exit rule hit.`);
        prev.high = price;
      }
      prev.action = coin.action;
    }
    const trail = state.trails.get(key) || [];
    trail.push(price);
    state.trails.set(key, trail.slice(-28));
  }
}

function render() {
  const coins = visibleCoins();
  const best = coins.find((coin) => coin.action === "ENTER") || coins.find((coin) => coin.action === "HOLD") || coins[0];
  if (!best) {
    hero.className = "hero empty";
    hero.innerHTML = state.search
      ? "Is search par koi liquid pair nahi mila."
      : "Is filter par koi coin nahi. Chain ya signal badlo.";
  } else {
    hero.className = "hero";
    const session = state.session.get(keyOf(best));
    const fromOpen = session?.open ? ((best.priceUsd - session.open) / session.open) * 100 : 0;
    hero.innerHTML = `
      <div class="kicker">
        <span>${state.search ? "Search ka best" : "Abhi ka best setup"}</span>
        <span class="badge ${best.action}">${ACTION_HI[best.action]} · ${best.score}</span>
      </div>
      <div class="hero-row">
        ${avatar(best)}
        <h1>${best.symbol}</h1>
      </div>
      <p class="verdict">${best.invest}. ${best.verdict}</p>
      <div class="stats">
        ${stat("Price", fmtPx(best.priceUsd))}
        ${stat("5m", signed(best.priceChange.m5))}
        ${stat("1h", signed(best.priceChange.h1))}
        ${stat("24h", signed(best.priceChange.h24))}
        ${stat("Liquidity", fmtUsd(best.liquidityUsd))}
        ${stat("MCap", fmtUsd(best.marketCap))}
        ${stat("Desk open se", signed(fromOpen))}
      </div>
      <ul class="why">${best.why.map((item) => `<li>${item}</li>`).join("")}</ul>
      <div class="levels">
        ${level("Stop", best.levels.stop)}
        ${level("Exit 1 · +25%", best.levels.target1)}
        ${level("Exit 2 · +55%", best.levels.target2)}
      </div>
      <div class="hero-actions">
        <button class="solid" type="button" data-open="${keyOf(best)}">Exit plan kholo</button>
        <a href="${best.url}" target="_blank" rel="noreferrer">DexScreener</a>
        <button class="ghost" type="button" data-watch="${keyOf(best)}">${isWatched(keyOf(best)) ? "Watch hatayo" : "Exit alert lagao"}</button>
      </div>`;
  }

  list.innerHTML = coins
    .map((coin) => {
      const session = state.session.get(keyOf(coin));
      const fromOpen = session?.open ? ((coin.priceUsd - session.open) / session.open) * 100 : 0;
      return `<article class="card" data-key="${keyOf(coin)}">
        <div class="card-top">
          ${avatar(coin)}
          <div>
            <div class="sym">${coin.symbol} <span class="badge ${coin.action}">${ACTION_HI[coin.action]}</span></div>
            <div class="subline">${coin.name} · ${coin.chainId} · ${coin.dexId} · age ${age(coin.ageMin)}</div>
            <div class="subline">${coin.invest}</div>
          </div>
        </div>
        <div class="metrics">
          <div><span>Price</span><b>${fmtPx(coin.priceUsd)}</b></div>
          <div><span>1h</span>${signed(coin.priceChange.h1)}</div>
          <div><span>Live</span>${signed(fromOpen)}</div>
          <div><span>Liq</span><b>${fmtUsd(coin.liquidityUsd)}</b></div>
          <div><span>Score</span><b>${coin.score}</b></div>
        </div>
        <div class="card-actions">
          <button type="button" data-open="${keyOf(coin)}">Plan</button>
          <a href="${coin.url}" target="_blank" rel="noreferrer">Chart</a>
        </div>
      </article>`;
    })
    .join("");

  if (state.openKey) paintDrawer();
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
}
function level(label, price) {
  return `<div class="level"><span>${label}</span><b>${fmtPx(price)}</b></div>`;
}
function avatar(coin) {
  return coin.image
    ? `<img class="avatar" alt="" src="${coin.image}" />`
    : `<div class="ph"></div>`;
}

function isWatched(key) {
  return new Set(JSON.parse(localStorage.getItem("nazar-watch") || "[]")).has(key);
}

function toggleWatch(key) {
  const set = new Set(JSON.parse(localStorage.getItem("nazar-watch") || "[]"));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  localStorage.setItem("nazar-watch", JSON.stringify([...set]));
  render();
}

function openCoin(key) {
  state.openKey = key;
  paintDrawer();
  drawer.hidden = false;
}

function closeDrawer() {
  state.openKey = null;
  drawer.hidden = true;
  drawer.innerHTML = "";
}

function paintDrawer() {
  const coin = state.coins.find((item) => keyOf(item) === state.openKey);
  if (!coin) return;
  const trail = state.trails.get(state.openKey) || [coin.priceUsd];
  const max = Math.max(...trail);
  const min = Math.min(...trail);
  const bars = trail
    .map((price) => {
      const h = max === min ? 40 : 12 + ((price - min) / (max - min)) * 42;
      return `<i style="height:${h}px"></i>`;
    })
    .join("");
  const session = state.session.get(state.openKey);
  drawer.innerHTML = `
    <header>
      <div class="id">${avatar(coin)}<div><div class="badge ${coin.action}">${ACTION_HI[coin.action]} · score ${coin.score}</div><h2>${coin.symbol}</h2></div></div>
      <button class="close" type="button" id="close">×</button>
    </header>
    <p><b>${coin.invest}.</b> ${coin.verdict}</p>
    <div class="spark" title="Is desk par live price">${bars}</div>
    <div class="subline">Desk open ${fmtPx(session?.open)} · session high ${fmtPx(session?.high)} · ab ${fmtPx(coin.priceUsd)}</div>
    <h3>Kab exit lo</h3>
    <ul class="plan">${coin.exitWhen.map((item) => `<li>${item}</li>`).join("")}</ul>
    <h3>Kyun</h3>
    <ul class="plan">${coin.why.map((item) => `<li>${item}</li>`).join("")}</ul>
    <div class="hero-actions">
      <a href="${coin.url}" target="_blank" rel="noreferrer">DexScreener chart</a>
      <button class="ghost" type="button" id="watch">${isWatched(state.openKey) ? "Alert hatao" : "Exit alert lagao"}</button>
    </div>`;
  drawer.querySelector("#close").onclick = closeDrawer;
  drawer.querySelector("#watch").onclick = () => toggleWatch(state.openKey);
}

hero.addEventListener("click", (event) => {
  const watch = event.target.closest("[data-watch]");
  if (watch) toggleWatch(watch.dataset.watch);
});

function showToast(text) {
  toast.hidden = false;
  toast.textContent = text;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 7000);
}

const DEX = "https://api.dexscreener.com";
let requestId = 0;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("DexScreener " + response.status);
  return response.json();
}

async function pairsForTokens(tokens) {
  const byChain = new Map();
  for (const token of tokens) {
    if (!token?.chainId || !token?.tokenAddress) continue;
    const list = byChain.get(token.chainId) || [];
    if (!list.includes(token.tokenAddress)) list.push(token.tokenAddress);
    byChain.set(token.chainId, list);
  }
  const pairs = [];
  for (const [chain, addresses] of byChain) {
    for (let i = 0; i < addresses.length; i += 30) {
      const chunk = addresses.slice(i, i + 30).join(",");
      try {
        const data = await getJson(`${DEX}/tokens/v1/${chain}/${chunk}`);
        if (Array.isArray(data)) pairs.push(...data);
      } catch (error) {
        console.error(error);
      }
    }
  }
  return pairs;
}

async function loadBoard() {
  if (state.search) {
    const data = await getJson(`${DEX}/latest/dex/search?q=${encodeURIComponent(state.search)}`);
    const coins = rankPairs(Array.isArray(data.pairs) ? data.pairs : []);
    return { updatedAt: Date.now(), coins };
  }
  const [top, latest, profiles] = await Promise.all([
    getJson(`${DEX}/token-boosts/top/v1`),
    getJson(`${DEX}/token-boosts/latest/v1`),
    getJson(`${DEX}/token-profiles/latest/v1`),
  ]);
  const pairs = await pairsForTokens([
    ...(Array.isArray(top) ? top : []),
    ...(Array.isArray(latest) ? latest : []),
    ...(Array.isArray(profiles) ? profiles : []),
  ]);
  return { updatedAt: Date.now(), coins: rankPairs(pairs) };
}

async function load() {
  const id = ++requestId;
  liveLabel.textContent = "update ho raha hai";
  const data = await loadBoard();
  if (id !== requestId) return;
  state.coins = data.coins || [];
  state.updatedAt = data.updatedAt;
  track(state.coins);
  const seconds = Math.max(0, Math.round((Date.now() - data.updatedAt) / 1000));
  liveLabel.textContent = state.search
    ? `"${state.search}" · ${state.coins.length} pairs`
    : `live · ${seconds}s pehle · ${state.coins.length} coins`;
  render();
}

async function tick() {
  try {
    await load();
  } catch (error) {
    liveLabel.textContent = "DexScreener ruk gaya, dubara try";
    hero.className = "hero empty";
    hero.textContent = error.message;
  }
}

tick();
setInterval(tick, 15000);
