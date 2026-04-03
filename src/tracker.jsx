import { useState, useEffect, useRef } from "react";

const PHASES = { SETUP: "setup", PLAYING: "playing", CASHOUT: "cashout", SUMMARY: "summary" };

// Settlement algorithm: minimize transactions
function calculateSettlements(players) {
  const balances = players.map(p => ({
    name: p.name,
    balance: p.finalChips - p.totalBuyIn,
  }));

  const debtors = balances.filter(b => b.balance < 0).map(b => ({ ...b, balance: Math.abs(b.balance) })).sort((a, b) => b.balance - a.balance);
  const creditors = balances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);

  const settlements = [];
  let di = 0, ci = 0;
  const d = debtors.map(x => ({ ...x }));
  const c = creditors.map(x => ({ ...x }));

  while (di < d.length && ci < c.length) {
    const amount = Math.min(d[di].balance, c[ci].balance);
    if (amount > 0.001) {
      settlements.push({ from: d[di].name, to: c[ci].name, amount: Math.round(amount * 100) / 100 });
    }
    d[di].balance -= amount;
    c[ci].balance -= amount;
    if (d[di].balance < 0.01) di++;
    if (c[ci].balance < 0.01) ci++;
  }
  return settlements;
}

function formatCurrency(val) {
  return `$${Number(val).toFixed(2)}`;
}

// Animated number component
function AnimNum({ value, prefix = "$" }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.01) { setDisplay(value); return; }
    const steps = 12;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setDisplay(start + diff * (step / steps));
      if (step >= steps) { setDisplay(value); clearInterval(iv); }
    }, 25);
    return () => clearInterval(iv);
  }, [value]);
  return <span>{prefix}{Number(display).toFixed(2)}</span>;
}

export default function PokerTracker() {
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState(PHASES.SETUP);
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState("");
  const [newBuyIn, setNewBuyIn] = useState("");
  const [rebuyAmounts, setRebuyAmounts] = useState({});
  const [cashoutAmounts, setCashoutAmounts] = useState({});
  const [settlements, setSettlements] = useState([]);
  const [toast, setToast] = useState(null);
  const [addingMid, setAddingMid] = useState(false);
  const [midName, setMidName] = useState("");
  const [midBuyIn, setMidBuyIn] = useState("");
  const [cashingOut, setCashingOut] = useState({});
  const [midCashoutAmounts, setMidCashoutAmounts] = useState({});
  const [history, setHistory] = useState([]);
  const [viewingGame, setViewingGame] = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const nameRef = useRef(null);
  const midNameRef = useRef(null);
  const saveTimer = useRef(null);

  // --- Persistent storage: load on mount ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ledger-game-state");
      if (raw) {
        const s = JSON.parse(raw);
        if (s.phase) setPhase(s.phase);
        if (s.players) setPlayers(s.players);
        if (s.settlements) setSettlements(s.settlements);
        if (s.cashoutAmounts) setCashoutAmounts(s.cashoutAmounts);
      }
    } catch (e) {}
    try {
      const hRaw = localStorage.getItem("ledger-game-history");
      if (hRaw) {
        setHistory(JSON.parse(hRaw));
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  // --- Persistent storage: auto-save on important state changes ---
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem("ledger-game-state", JSON.stringify({
          phase,
          players,
          settlements,
          cashoutAmounts,
        }));
      } catch (e) {
        // Silent fail on save
      }
    }, 300); // debounce 300ms
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [phase, players, settlements, cashoutAmounts, loaded]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const addPlayer = (name, buyIn, duringGame = false) => {
    if (!name.trim()) return;
    const amount = parseFloat(buyIn);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid buy-in amount"); return; }
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      showToast("Player already exists"); return;
    }
    const player = {
      id: Date.now(),
      name: name.trim(),
      buyIns: [amount],
      totalBuyIn: amount,
      finalChips: 0,
      cashedOut: false,
    };
    setPlayers(prev => [...prev, player]);
    if (duringGame) {
      setMidName("");
      setMidBuyIn("");
      setAddingMid(false);
      showToast(`${player.name} joined the game!`);
    } else {
      setNewName("");
      setNewBuyIn("");
      nameRef.current?.focus();
    }
  };

  const addRebuy = (playerId) => {
    const amount = parseFloat(rebuyAmounts[playerId]);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid rebuy amount"); return; }
    setPlayers(prev => prev.map(p =>
      p.id === playerId
        ? { ...p, buyIns: [...p.buyIns, amount], totalBuyIn: p.totalBuyIn + amount }
        : p
    ));
    setRebuyAmounts(prev => ({ ...prev, [playerId]: "" }));
    showToast("Rebuy added!");
  };

  const removePlayer = (playerId) => {
    setPlayers(prev => prev.filter(p => p.id !== playerId));
  };

  const midGameCashout = (playerId) => {
    const amount = parseFloat(midCashoutAmounts[playerId]);
    if (isNaN(amount) || amount < 0) { showToast("Enter a valid chip amount"); return; }
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, cashedOut: true, finalChips: amount } : p
    ));
    setCashingOut(prev => ({ ...prev, [playerId]: false }));
    setMidCashoutAmounts(prev => ({ ...prev, [playerId]: "" }));
    const player = players.find(p => p.id === playerId);
    showToast(`${player?.name} cashed out!`);
  };

  const startGame = () => {
    if (players.length < 2) { showToast("Need at least 2 players"); return; }
    setPhase(PHASES.PLAYING);
  };

  const startCashout = () => {
    const init = {};
    players.filter(p => !p.cashedOut).forEach(p => { init[p.id] = ""; });
    setCashoutAmounts(init);
    setPhase(PHASES.CASHOUT);
  };

  const finishGame = () => {
    const updated = players.map(p => p.cashedOut ? p : ({
      ...p,
      finalChips: parseFloat(cashoutAmounts[p.id]) || 0,
    }));
    setPlayers(updated);
    const s = calculateSettlements(updated);
    setSettlements(s);
    setPhase(PHASES.SUMMARY);

    // Save to history
    const gameRecord = {
      id: Date.now(),
      date: new Date().toISOString(),
      players: updated.map(p => ({
        name: p.name, totalBuyIn: p.totalBuyIn, finalChips: p.finalChips,
        net: Math.round((p.finalChips - p.totalBuyIn) * 100) / 100,
        cashedOut: p.cashedOut || false,
      })),
      totalPot: updated.reduce((sum, p) => sum + p.totalBuyIn, 0),
      settlements: s,
    };
    const newHistory = [gameRecord, ...history].slice(0, 100); // keep last 100
    setHistory(newHistory);
    try { localStorage.setItem("ledger-game-history", JSON.stringify(newHistory)); } catch (e) {}
  };

  const resetGame = () => {
    setPlayers([]);
    setPhase(PHASES.SETUP);
    setSettlements([]);
    setNewName("");
    setNewBuyIn("");
    setRebuyAmounts({});
    setCashoutAmounts({});
    setCashingOut({});
    setMidCashoutAmounts({});
    try { localStorage.removeItem("ledger-game-state"); } catch (e) {}
  };

  const deleteHistoryGame = (gameId) => {
    const newHistory = history.filter(g => g.id !== gameId);
    setHistory(newHistory);
    if (viewingGame === gameId) setViewingGame(null);
    try { localStorage.setItem("ledger-game-history", JSON.stringify(newHistory)); } catch (e) {}
  };

  const clearAllHistory = () => {
    setHistory([]);
    setViewingGame(null);
    setConfirmClearHistory(false);
    try { localStorage.removeItem("ledger-game-history"); } catch (e) {}
    showToast("History cleared");
  };

  const totalPot = players.reduce((s, p) => s + p.totalBuyIn, 0);
  const cashedOutChips = players.filter(p => p.cashedOut).reduce((s, p) => s + p.finalChips, 0);
  const activePlayers = players.filter(p => !p.cashedOut);
  const activePlayerCount = activePlayers.length;
  const totalCashout = activePlayers.reduce((s, p) => s + (parseFloat(cashoutAmounts[p.id]) || 0), 0);
  const remainingPot = totalPot - cashedOutChips;
  const potBalanced = phase === PHASES.CASHOUT ? Math.abs(remainingPot - totalCashout) < 0.01 : true;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #0a0e1a 0%, #121a2e 40%, #0d1520 100%)",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#e8e6e1",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet" />

      {/* Loading screen while restoring state */}
      {!loaded && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", gap: 16,
        }}>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(34,197,94,0.15)",
            borderTopColor: "#22c55e", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 13, color: "rgba(232,230,225,0.35)", letterSpacing: 2, textTransform: "uppercase" }}>
            Restoring game...
          </div>
        </div>
      )}

      {loaded && <>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "-40%", right: "-20%", width: "70vw", height: "70vw",
        background: "radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "fixed", bottom: "-30%", left: "-15%", width: "60vw", height: "60vw",
        background: "radial-gradient(circle, rgba(251,191,36,0.04) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 999,
          background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
          backdropFilter: "blur(20px)", padding: "10px 24px", borderRadius: 12,
          fontSize: 14, fontWeight: 500, color: "#fbbf24",
          animation: "fadeInDown 0.3s ease",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeInDown { from { opacity:0; transform: translateX(-50%) translateY(-12px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        @keyframes fadeInUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform: translateX(-20px); } to { opacity:1; transform: translateX(0); } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }
        input:focus { outline: none; border-color: rgba(34,197,94,0.5) !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1); }
        input::placeholder { color: rgba(232,230,225,0.25); }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: 6, textTransform: "uppercase", color: "rgba(34,197,94,0.6)", marginBottom: 8, fontWeight: 500 }}>
            ♠ ♥ ♦ ♣
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif", fontSize: 38, fontWeight: 800,
            margin: 0, letterSpacing: -1,
            background: "linear-gradient(135deg, #e8e6e1 0%, #a8a49c 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            The Ledger
          </h1>
          <div style={{ fontSize: 13, color: "rgba(232,230,225,0.35)", marginTop: 4, letterSpacing: 1 }}>
            CARD GAME TRACKER
          </div>
        </div>

        {/* Pot display */}
        {players.length > 0 && phase !== PHASES.SUMMARY && (
          <div style={{
            textAlign: "center", marginBottom: 32, padding: "20px 0",
            borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "rgba(232,230,225,0.35)", marginBottom: 6 }}>
              Total Pot
            </div>
            <div style={{
              fontSize: 42, fontWeight: 700, fontFamily: "'DM Sans', monospace",
              color: "#22c55e",
              textShadow: "0 0 40px rgba(34,197,94,0.2)",
            }}>
              <AnimNum value={totalPot} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(232,230,225,0.3)", marginTop: 4 }}>
              {players.length} player{players.length !== 1 ? "s" : ""}
              {players.some(p => p.cashedOut) && ` (${activePlayerCount} active)`}
            </div>
          </div>
        )}

        {/* SETUP PHASE */}
        {phase === PHASES.SETUP && (
          <div style={{ animation: "fadeInUp 0.4s ease" }}>
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: 24, marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "rgba(232,230,225,0.5)", letterSpacing: 1, textTransform: "uppercase" }}>
                Add Players
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={nameRef}
                  placeholder="Player name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("buyinInput")?.focus()}
                  style={{
                    flex: "1 1 140px", padding: "12px 16px", borderRadius: 10,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e8e6e1", fontSize: 15, transition: "all 0.2s",
                  }}
                />
                <input
                  id="buyinInput"
                  placeholder="Buy-in $"
                  type="number"
                  min="0"
                  step="any"
                  value={newBuyIn}
                  onChange={e => setNewBuyIn(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addPlayer(newName, newBuyIn); }}
                  style={{
                    flex: "0 0 110px", padding: "12px 16px", borderRadius: 10,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e8e6e1", fontSize: 15, transition: "all 0.2s",
                  }}
                />
                <button
                  onClick={() => addPlayer(newName, newBuyIn)}
                  style={{
                    flex: "0 0 auto", padding: "12px 20px", borderRadius: 10,
                    background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e", fontSize: 14, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={e => { e.target.style.background = "rgba(34,197,94,0.25)"; }}
                  onMouseOut={e => { e.target.style.background = "rgba(34,197,94,0.15)"; }}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Player list */}
            {players.map((p, i) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", marginBottom: 8, borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                  <span style={{ marginLeft: 12, color: "#22c55e", fontWeight: 500, fontSize: 14 }}>
                    {formatCurrency(p.totalBuyIn)}
                  </span>
                </div>
                <button
                  onClick={() => removePlayer(p.id)}
                  style={{
                    background: "none", border: "none", color: "rgba(232,230,225,0.2)",
                    cursor: "pointer", fontSize: 18, padding: "4px 8px", transition: "color 0.2s",
                  }}
                  onMouseOver={e => { e.target.style.color = "#ef4444"; }}
                  onMouseOut={e => { e.target.style.color = "rgba(232,230,225,0.2)"; }}
                >
                  ×
                </button>
              </div>
            ))}

            {players.length >= 2 && (
              <button
                onClick={startGame}
                style={{
                  width: "100%", padding: "16px", marginTop: 20, borderRadius: 12,
                  background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none",
                  color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                  letterSpacing: 0.5, transition: "all 0.2s",
                  boxShadow: "0 4px 24px rgba(34,197,94,0.25)",
                }}
                onMouseOver={e => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 6px 32px rgba(34,197,94,0.35)"; }}
                onMouseOut={e => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 4px 24px rgba(34,197,94,0.25)"; }}
              >
                Start Game →
              </button>
            )}

            {/* Game History */}
            {history.length > 0 && (
              <div style={{ marginTop: 36 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "rgba(232,230,225,0.35)", fontWeight: 600 }}>
                    Past Games
                  </div>
                  {!confirmClearHistory ? (
                    <button
                      onClick={() => setConfirmClearHistory(true)}
                      style={{
                        background: "none", border: "none", color: "rgba(232,230,225,0.2)",
                        fontSize: 12, cursor: "pointer", padding: "4px 8px", transition: "color 0.2s",
                      }}
                      onMouseOver={e => { e.target.style.color = "#ef4444"; }}
                      onMouseOut={e => { e.target.style.color = "rgba(232,230,225,0.2)"; }}
                    >
                      Clear All
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#ef4444" }}>Sure?</span>
                      <button onClick={clearAllHistory} style={{
                        background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                        color: "#ef4444", fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                      }}>Yes</button>
                      <button onClick={() => setConfirmClearHistory(false)} style={{
                        background: "none", border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(232,230,225,0.4)", fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                      }}>No</button>
                    </div>
                  )}
                </div>

                {history.map((game, gi) => {
                  const dateStr = new Date(game.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                  const timeStr = new Date(game.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                  const isOpen = viewingGame === game.id;
                  const winner = [...game.players].sort((a, b) => b.net - a.net)[0];

                  return (
                    <div key={game.id} style={{
                      marginBottom: 8, borderRadius: 12, overflow: "hidden",
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      animation: `slideIn 0.3s ease ${gi * 0.04}s both`,
                    }}>
                      {/* Header row — always visible */}
                      <div
                        onClick={() => setViewingGame(isOpen ? null : game.id)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "14px 16px", cursor: "pointer", transition: "background 0.15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                        onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {game.players.map(p => p.name).join(", ")}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(232,230,225,0.3)", marginTop: 2 }}>
                            {dateStr} · {timeStr} · Pot: <span style={{ color: "#22c55e" }}>{formatCurrency(game.totalPot)}</span>
                            {winner && winner.net > 0 && (
                              <span> · <span style={{ color: "#fbbf24" }}>{winner.name} +{formatCurrency(winner.net)}</span></span>
                            )}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 14, color: "rgba(232,230,225,0.25)", transition: "transform 0.2s",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block",
                        }}>▾</span>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div style={{
                          padding: "0 16px 16px", animation: "fadeInUp 0.25s ease",
                          borderTop: "1px solid rgba(255,255,255,0.04)",
                        }}>
                          {/* Standings */}
                          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(232,230,225,0.25)", margin: "12px 0 8px", fontWeight: 600 }}>
                            Standings
                          </div>
                          {[...game.players].sort((a, b) => b.net - a.net).map((p, pi) => (
                            <div key={pi} style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              padding: "8px 0",
                              borderBottom: pi < game.players.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                            }}>
                              <div style={{ fontSize: 13 }}>
                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                {p.cashedOut && <span style={{
                                  fontSize: 9, marginLeft: 6, padding: "1px 5px", borderRadius: 4,
                                  background: "rgba(139,92,246,0.12)", color: "#a78bfa",
                                  border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600,
                                }}>EARLY</span>}
                                <span style={{ color: "rgba(232,230,225,0.25)", marginLeft: 8, fontSize: 12 }}>
                                  in: {formatCurrency(p.totalBuyIn)} → out: {formatCurrency(p.finalChips)}
                                </span>
                              </div>
                              <span style={{
                                fontWeight: 700, fontSize: 14,
                                color: Math.abs(p.net) < 0.01 ? "rgba(232,230,225,0.4)" : p.net > 0 ? "#22c55e" : "#ef4444",
                              }}>
                                {Math.abs(p.net) < 0.01 ? "Even" : `${p.net > 0 ? "+" : ""}${formatCurrency(p.net)}`}
                              </span>
                            </div>
                          ))}

                          {/* Settlements */}
                          {game.settlements.length > 0 && (
                            <>
                              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(232,230,225,0.25)", margin: "14px 0 8px", fontWeight: 600 }}>
                                Settlements
                              </div>
                              {game.settlements.map((s, si) => (
                                <div key={si} style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                  padding: "6px 0",
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                                    <span style={{ fontWeight: 600, color: "#ef4444" }}>{s.from}</span>
                                    <span style={{ color: "rgba(232,230,225,0.15)" }}>→</span>
                                    <span style={{ fontWeight: 600, color: "#22c55e" }}>{s.to}</span>
                                  </div>
                                  <span style={{ fontWeight: 700, color: "#fbbf24", fontSize: 14 }}>
                                    {formatCurrency(s.amount)}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}

                          {/* Delete this game */}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteHistoryGame(game.id); }}
                            style={{
                              marginTop: 12, padding: "6px 14px", borderRadius: 6, fontSize: 12,
                              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
                              color: "rgba(239,68,68,0.6)", cursor: "pointer", transition: "all 0.2s",
                            }}
                            onMouseOver={e => { e.target.style.color = "#ef4444"; e.target.style.borderColor = "rgba(239,68,68,0.3)"; }}
                            onMouseOut={e => { e.target.style.color = "rgba(239,68,68,0.6)"; e.target.style.borderColor = "rgba(239,68,68,0.15)"; }}
                          >
                            Delete Game
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PLAYING PHASE */}
        {phase === PHASES.PLAYING && (
          <div style={{ animation: "fadeInUp 0.4s ease" }}>

            {/* Live indicator */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              marginBottom: 24, fontSize: 12, color: "rgba(34,197,94,0.7)", fontWeight: 600,
              letterSpacing: 2, textTransform: "uppercase",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: "#22c55e",
                animation: "pulse 2s infinite",
              }} />
              Game in Progress
            </div>

            {players.map((p, i) => p.cashedOut ? (
              /* Cashed out player card */
              <div key={p.id} style={{
                padding: "14px 20px", marginBottom: 10, borderRadius: 14,
                background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                opacity: 0.55,
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                      {p.name}
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 6,
                        background: "rgba(139,92,246,0.15)", color: "#a78bfa",
                        border: "1px solid rgba(139,92,246,0.25)", fontWeight: 600,
                        letterSpacing: 1, textTransform: "uppercase",
                      }}>Cashed Out</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(232,230,225,0.3)", marginTop: 2 }}>
                      In: {formatCurrency(p.totalBuyIn)} → Out: {formatCurrency(p.finalChips)}
                      {' · '}
                      <span style={{ color: p.finalChips - p.totalBuyIn >= 0 ? "#22c55e" : "#ef4444" }}>
                        {p.finalChips - p.totalBuyIn >= 0 ? "+" : ""}{formatCurrency(p.finalChips - p.totalBuyIn)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Active player card */
              <div key={p.id} style={{
                padding: "18px 20px", marginBottom: 10, borderRadius: 14,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(232,230,225,0.35)", marginTop: 2 }}>
                      {p.buyIns.length} buy-in{p.buyIns.length > 1 ? "s" : ""} · Total: <span style={{ color: "#22c55e" }}>{formatCurrency(p.totalBuyIn)}</span>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 700, color: "#22c55e",
                    fontFamily: "'DM Sans', monospace",
                  }}>
                    <AnimNum value={p.totalBuyIn} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    placeholder="Rebuy $"
                    type="number"
                    min="0"
                    step="any"
                    value={rebuyAmounts[p.id] || ""}
                    onChange={e => setRebuyAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") addRebuy(p.id); }}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e8e6e1", fontSize: 14, transition: "all 0.2s",
                    }}
                  />
                  <button
                    onClick={() => addRebuy(p.id)}
                    style={{
                      padding: "10px 16px", borderRadius: 8,
                      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)",
                      color: "#fbbf24", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      transition: "all 0.2s", whiteSpace: "nowrap",
                    }}
                    onMouseOver={e => { e.target.style.background = "rgba(251,191,36,0.22)"; }}
                    onMouseOut={e => { e.target.style.background = "rgba(251,191,36,0.12)"; }}
                  >
                    + Rebuy
                  </button>
                  {/* Cash out button - only show if more than 2 active players */}
                  {activePlayerCount > 2 && !cashingOut[p.id] && (
                    <button
                      onClick={() => setCashingOut(prev => ({ ...prev, [p.id]: true }))}
                      style={{
                        padding: "10px 14px", borderRadius: 8,
                        background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
                        color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.2s", whiteSpace: "nowrap",
                      }}
                      onMouseOver={e => { e.target.style.background = "rgba(139,92,246,0.2)"; }}
                      onMouseOut={e => { e.target.style.background = "rgba(139,92,246,0.1)"; }}
                    >
                      Cash Out
                    </button>
                  )}
                </div>
                {/* Mid-game cashout input */}
                {cashingOut[p.id] && (
                  <div style={{
                    display: "flex", gap: 8, marginTop: 10, padding: "10px 12px",
                    borderRadius: 8, background: "rgba(139,92,246,0.06)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    animation: "fadeInUp 0.2s ease",
                  }}>
                    <input
                      placeholder="Final chips $"
                      type="number"
                      min="0"
                      step="any"
                      autoFocus
                      value={midCashoutAmounts[p.id] || ""}
                      onChange={e => setMidCashoutAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") midGameCashout(p.id); }}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 6,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#e8e6e1", fontSize: 14,
                      }}
                    />
                    <button onClick={() => midGameCashout(p.id)} style={{
                      padding: "8px 14px", borderRadius: 6,
                      background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)",
                      color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}>Confirm</button>
                    <button onClick={() => setCashingOut(prev => ({ ...prev, [p.id]: false }))} style={{
                      padding: "8px 10px", borderRadius: 6,
                      background: "none", border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(232,230,225,0.4)", fontSize: 13, cursor: "pointer",
                    }}>×</button>
                  </div>
                )}
                {p.buyIns.length > 1 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {p.buyIns.map((b, bi) => (
                      <span key={bi} style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 6,
                        background: bi === 0 ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.1)",
                        color: bi === 0 ? "#22c55e" : "#fbbf24",
                        border: `1px solid ${bi === 0 ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}`,
                      }}>
                        {bi === 0 ? "Initial" : `Rebuy ${bi}`}: {formatCurrency(b)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Add player mid-game */}
            {!addingMid ? (
              <button
                onClick={() => { setAddingMid(true); setTimeout(() => midNameRef.current?.focus(), 100); }}
                style={{
                  width: "100%", padding: "14px", marginTop: 8, marginBottom: 8, borderRadius: 12,
                  background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)",
                  color: "rgba(232,230,225,0.4)", fontSize: 14, cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseOver={e => { e.target.style.borderColor = "rgba(34,197,94,0.3)"; e.target.style.color = "#22c55e"; }}
                onMouseOut={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.color = "rgba(232,230,225,0.4)"; }}
              >
                + Add New Player
              </button>
            ) : (
              <div style={{
                padding: 18, marginTop: 8, marginBottom: 8, borderRadius: 14,
                background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)",
                animation: "fadeInUp 0.3s ease",
              }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    ref={midNameRef}
                    placeholder="Name"
                    value={midName}
                    onChange={e => setMidName(e.target.value)}
                    style={{
                      flex: "1 1 120px", padding: "10px 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e8e6e1", fontSize: 14,
                    }}
                  />
                  <input
                    placeholder="Buy-in $"
                    type="number"
                    min="0"
                    step="any"
                    value={midBuyIn}
                    onChange={e => setMidBuyIn(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addPlayer(midName, midBuyIn, true); }}
                    style={{
                      flex: "0 0 100px", padding: "10px 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e8e6e1", fontSize: 14,
                    }}
                  />
                  <button onClick={() => addPlayer(midName, midBuyIn, true)} style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>Add</button>
                  <button onClick={() => setAddingMid(false)} style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "none", border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(232,230,225,0.4)", fontSize: 13, cursor: "pointer",
                  }}>×</button>
                </div>
              </div>
            )}

            <button
              onClick={startCashout}
              style={{
                width: "100%", padding: "16px", marginTop: 16, borderRadius: 12,
                background: "linear-gradient(135deg, #dc2626, #b91c1c)", border: "none",
                color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                letterSpacing: 0.5, transition: "all 0.2s",
                boxShadow: "0 4px 24px rgba(220,38,38,0.25)",
              }}
              onMouseOver={e => { e.target.style.transform = "translateY(-1px)"; }}
              onMouseOut={e => { e.target.style.transform = "translateY(0)"; }}
            >
              Finish Game
            </button>
          </div>
        )}

        {/* CASHOUT PHASE */}
        {phase === PHASES.CASHOUT && (
          <div style={{ animation: "fadeInUp 0.4s ease" }}>
            <div style={{
              textAlign: "center", fontSize: 13, color: "rgba(232,230,225,0.4)",
              marginBottom: 24, letterSpacing: 1, textTransform: "uppercase",
            }}>
              Enter Final Chip Counts
            </div>

            {players.filter(p => !p.cashedOut).map((p, i) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "16px 18px", marginBottom: 8, borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(232,230,225,0.3)" }}>
                    Bought in: {formatCurrency(p.totalBuyIn)}
                  </div>
                </div>
                <input
                  placeholder="Final chips $"
                  type="number"
                  min="0"
                  step="any"
                  value={cashoutAmounts[p.id] || ""}
                  onChange={e => setCashoutAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                  style={{
                    width: 130, padding: "10px 14px", borderRadius: 8,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#e8e6e1", fontSize: 15, textAlign: "right",
                    fontWeight: 600,
                  }}
                />
              </div>
            ))}

            {/* Balance check */}
            <div style={{
              textAlign: "center", padding: "14px", marginTop: 12, borderRadius: 10,
              background: potBalanced ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${potBalanced ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}`,
              fontSize: 13, color: potBalanced ? "#22c55e" : "#fbbf24",
            }}>
              {potBalanced
                ? "✓ Pot balanced"
                : `Chip total (${formatCurrency(totalCashout)}) ≠ Remaining pot (${formatCurrency(remainingPot)}) — off by ${formatCurrency(Math.abs(remainingPot - totalCashout))}`
              }
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setPhase(PHASES.PLAYING)}
                style={{
                  flex: 1, padding: "14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(232,230,225,0.6)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                onClick={finishGame}
                disabled={!potBalanced}
                style={{
                  flex: 2, padding: "14px", borderRadius: 12,
                  background: potBalanced ? "linear-gradient(135deg, #22c55e, #16a34a)" : "rgba(255,255,255,0.05)",
                  border: "none",
                  color: potBalanced ? "#fff" : "rgba(232,230,225,0.3)",
                  fontSize: 15, fontWeight: 700, cursor: potBalanced ? "pointer" : "not-allowed",
                  boxShadow: potBalanced ? "0 4px 24px rgba(34,197,94,0.25)" : "none",
                  transition: "all 0.3s",
                }}
              >
                Calculate Settlements
              </button>
            </div>
          </div>
        )}

        {/* SUMMARY PHASE */}
        {phase === PHASES.SUMMARY && (
          <div style={{ animation: "fadeInUp 0.5s ease" }}>

            {/* Player results */}
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                color: "rgba(232,230,225,0.35)", marginBottom: 14, fontWeight: 600,
              }}>
                Final Standings
              </div>
              {[...players].sort((a, b) => (b.finalChips - b.totalBuyIn) - (a.finalChips - a.totalBuyIn)).map((p, i) => {
                const net = p.finalChips - p.totalBuyIn;
                const isUp = net > 0;
                const isEven = Math.abs(net) < 0.01;
                return (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px", marginBottom: 6, borderRadius: 12,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    animation: `slideIn 0.4s ease ${i * 0.08}s both`,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      {p.cashedOut && <span style={{
                        fontSize: 10, marginLeft: 8, padding: "2px 6px", borderRadius: 4,
                        background: "rgba(139,92,246,0.12)", color: "#a78bfa",
                        border: "1px solid rgba(139,92,246,0.2)", fontWeight: 600, verticalAlign: "middle",
                      }}>EARLY</span>}
                      <span style={{ fontSize: 12, color: "rgba(232,230,225,0.3)", marginLeft: 10 }}>
                        in: {formatCurrency(p.totalBuyIn)} → out: {formatCurrency(p.finalChips)}
                      </span>
                    </div>
                    <div style={{
                      fontWeight: 700, fontSize: 16,
                      color: isEven ? "rgba(232,230,225,0.5)" : isUp ? "#22c55e" : "#ef4444",
                    }}>
                      {isEven ? "Even" : `${isUp ? "+" : ""}${formatCurrency(net)}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Settlements */}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: 24,
            }}>
              <div style={{
                fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                color: "rgba(232,230,225,0.35)", marginBottom: 18, fontWeight: 600,
              }}>
                Who Pays Whom
              </div>
              {settlements.length === 0 ? (
                <div style={{ textAlign: "center", color: "rgba(232,230,225,0.4)", padding: "20px 0" }}>
                  Everyone broke even — no payments needed!
                </div>
              ) : (
                settlements.map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 0",
                    borderBottom: i < settlements.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    animation: `fadeInUp 0.4s ease ${i * 0.1 + 0.2}s both`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      <span style={{
                        fontWeight: 700, color: "#ef4444", fontSize: 15,
                        minWidth: 70,
                      }}>{s.from}</span>
                      <span style={{
                        fontSize: 18, color: "rgba(232,230,225,0.15)",
                      }}>→</span>
                      <span style={{
                        fontWeight: 700, color: "#22c55e", fontSize: 15,
                      }}>{s.to}</span>
                    </div>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      fontFamily: "'DM Sans', monospace",
                      color: "#fbbf24",
                      textShadow: "0 0 20px rgba(251,191,36,0.2)",
                    }}>
                      {formatCurrency(s.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={resetGame}
              style={{
                width: "100%", padding: "16px", marginTop: 28, borderRadius: 12,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(232,230,225,0.6)", fontSize: 15, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseOver={e => { e.target.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseOut={e => { e.target.style.background = "rgba(255,255,255,0.05)"; }}
            >
              New Game
            </button>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
