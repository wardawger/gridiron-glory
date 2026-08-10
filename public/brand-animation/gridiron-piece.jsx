const { CompositionStage, useComposition, Shot, Easing, clamp } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakSlider, TweakRadio } = window;

const C = { bg: '#0d1117', green: '#22c55e', gold: '#f59e0b', text: '#f5f6f7', muted: '#8b96a3', black: '#05070a' };
const DISPLAY = '"Bebas Neue", sans-serif';
const BODY = '"DM Sans", sans-serif';
const MONO = '"JetBrains Mono", monospace';

const clamp01 = (v) => clamp(v, 0, 1);
const seg = (t, a, b) => (b <= a ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)));
const lerp = (a, b, p) => a + (b - a) * p;

// ---------- shared pieces ----------

function Logomark({ size, opacity, scale }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top: 300, width: size, height: size,
      transform: `translate(-50%, 0) scale(${scale})`, opacity,
      background: C.green, borderRadius: size * 0.22,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 ${60 * scale}px rgba(34,197,94,${0.35 * opacity})`,
    }}>
      <span style={{ fontFamily: DISPLAY, fontSize: size * 0.62, color: '#05070a', lineHeight: 1, transform: 'translateY(4%)' }}>G</span>
    </div>
  );
}

function BrandLockup({ logoOpacity, logoScale, wordOpacity, tagOpacity, capOpacity }) {
  return (
    <React.Fragment>
      <Logomark size={200} opacity={logoOpacity} scale={logoScale} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 548, textAlign: 'center',
        opacity: wordOpacity, transform: `translateY(${lerp(16, 0, wordOpacity)}px)`,
      }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 108, letterSpacing: 4, color: C.text, lineHeight: 1 }}>GRIDIRON GLORY</div>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 664, textAlign: 'center', opacity: tagOpacity,
        transform: `translateY(${lerp(12, 0, tagOpacity)}px)`,
      }}>
        <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 30, color: C.text }}>Real games. One champion.</div>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 726, textAlign: 'center', opacity: capOpacity,
      }}>
        <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 15, letterSpacing: 3, color: C.muted, textTransform: 'uppercase' }}>
          College Football Fantasy League
        </div>
      </div>
    </React.Fragment>
  );
}

function OpeningLockup({ T }) {
  const lb = T; // starts at 0
  const holdEnd = seg(lb, 0, 0.3);
  const wordOut = 1 - seg(lb, 0.3, 0.9);
  const tagOut = 1 - seg(lb, 0.4, 0.95);
  const capOut = 1 - seg(lb, 0.5, 1.0);
  const logoAlive = 1 - seg(lb, 1.2, 1.6);
  return (
    <BrandLockup
      logoOpacity={logoAlive}
      logoScale={lerp(1, 0.85, seg(lb, 1.2, 1.6))}
      wordOpacity={wordOut}
      tagOpacity={tagOut}
      capOpacity={capOut}
    />
  );
}

function ClosingLockup({ T, cueStart }) {
  const lb = T - cueStart;
  const logoIn = seg(lb, 0, 0.8);
  const wordIn = seg(lb, 0.8, 1.4);
  const tagIn = seg(lb, 0.95, 1.5);
  const capIn = seg(lb, 1.1, 1.6);
  return (
    <BrandLockup
      logoOpacity={logoIn}
      logoScale={lerp(0.8, 1, Easing.easeOutCubic ? Easing.easeOutCubic(logoIn) : logoIn)}
      wordOpacity={wordIn}
      tagOpacity={tagIn}
      capOpacity={capIn}
    />
  );
}

function PerspectiveGridLayer({ T, cues, total, show }) {
  if (!show) return null;
  const openFade = 1 - seg(T, 0.9, 1.35);
  const openWindow = T < (cues.Draft || 2.5) ? openFade : 0;
  const closeIn = seg(T, cues.Closing || 0, (cues.Closing || 0) + 0.9);
  const closeWindow = T >= (cues.Closing || Infinity) ? closeIn : 0;
  const opacity = Math.max(openWindow, closeWindow) * 0.5;
  if (opacity <= 0.002) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}>
      <div style={{
        position: 'absolute', left: '50%', top: '40%', width: 2600, height: 1500,
        transform: 'translate(-50%, 0) perspective(700px) rotateX(62deg)',
        backgroundImage: `linear-gradient(90deg, rgba(34,197,94,0.5) 1px, transparent 1px), linear-gradient(0deg, rgba(34,197,94,0.5) 1px, transparent 1px)`,
        backgroundSize: '90px 90px',
        WebkitMaskImage: 'radial-gradient(circle at 50% 0%, black 0%, transparent 72%)',
        maskImage: 'radial-gradient(circle at 50% 0%, black 0%, transparent 72%)',
      }} />
    </div>
  );
}

function StatusPill({ text, color, style }) {
  return (
    <div style={{
      position: 'absolute', fontFamily: MONO, fontWeight: 700, fontSize: 15, letterSpacing: 2.5,
      color, border: `1px solid ${color}`, background: `${color}1f`, borderRadius: 999,
      padding: '8px 18px', textTransform: 'uppercase', whiteSpace: 'nowrap', ...style,
    }}>{text}</div>
  );
}

function CornerLabel({ T }) {
  const pulse = 0.5 + 0.5 * Math.sin(T * 4.2);
  return (
    <div style={{ position: 'absolute', top: 60, right: 80, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: 8, background: C.green, opacity: lerp(0.4, 1, pulse), boxShadow: `0 0 10px rgba(34,197,94,${0.6})` }} />
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, letterSpacing: 3, color: C.muted }}>WEEK 9 &middot; LIVE</span>
    </div>
  );
}

function Headline({ text, lb, color }) {
  const p = clamp01(lb / 0.7);
  const e = Easing.easeOutExpo ? Easing.easeOutExpo(p) : p;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 168, textAlign: 'center',
      clipPath: `polygon(0% 0%, ${e * 145}% 0%, ${e * 145 - 26}% 100%, 0% 100%)`,
      transform: `translateY(${lerp(26, 0, e)}px)`,
    }}>
      <div style={{
        fontFamily: DISPLAY, fontSize: 188, lineHeight: 0.92, color: color || C.text,
        textShadow: color === C.gold ? '0 0 46px rgba(245,158,11,0.45)' : 'none',
      }}>{text}</div>
    </div>
  );
}

function Subtext({ text, lb }) {
  const o = seg(lb, 0.35, 0.95);
  return (
    <div style={{
      position: 'absolute', left: '50%', top: 400, width: 980, transform: `translate(-50%,0) translateY(${lerp(14, 0, o)}px)`,
      opacity: o, textAlign: 'center',
    }}>
      <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: 30, color: C.muted, lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}

// ---------- mockups ----------

function ClockIcon({ pulse }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 18, border: `2px solid ${C.green}`, position: 'relative', flexShrink: 0,
      boxShadow: `0 0 ${10 + 8 * pulse}px rgba(34,197,94,0.5)`,
    }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 10, background: C.green, transform: 'translate(-50%,-100%) rotate(20deg)', transformOrigin: 'bottom' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 2, background: C.green, transform: 'translate(0,-50%) rotate(80deg)', transformOrigin: 'left' }} />
    </div>
  );
}

function TeamCard({ abbr, name, conf, fpi, o }) {
  return (
    <div style={{
      opacity: o, display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(139,150,163,0.2)', borderRadius: 12, padding: '12px 16px',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139,150,163,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.muted }}>{abbr}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 17, color: C.text }}>{name}</div>
        <div style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{conf}</div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.green, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 6, padding: '3px 7px', flexShrink: 0 }}>FPI #{fpi}</span>
    </div>
  );
}

function DraftMockup({ lb, scale }) {
  const o = seg(lb, 0.5, 1.15);
  const teams = [
    { abbr: 'ARIZ', name: 'Arizona', conf: 'Big 12', fpi: 34 },
    { abbr: 'AUB', name: 'Auburn', conf: 'SEC', fpi: 22 },
    { abbr: 'CLEM', name: 'Clemson', conf: 'ACC', fpi: 19 },
    { abbr: 'COLO', name: 'Colorado', conf: 'Big 12', fpi: 45 },
  ];
  const picks = [
    { n: 15, who: 'A. Diaz', team: 'Washington' },
    { n: 16, who: 'T. Brooks', team: 'Louisville' },
    { n: 17, who: 'M. Chen', team: 'Alabama' },
    { n: 18, who: 'Brent', team: 'ON THE CLOCK', active: true },
    { n: 19, who: 'J. Rivera', team: '—' },
    { n: 20, who: 'A. Diaz', team: '—' },
    { n: 21, who: 'T. Brooks', team: '—' },
  ];
  const pulse = 0.5 + 0.5 * Math.sin(lb * 5);
  return (
    <div style={{
      position: 'absolute', left: '50%', top: 500, transform: `translate(-50%,0) scale(${scale}) translateY(${lerp(18, 0, o)}px)`,
      opacity: o, width: 1040, display: 'flex', gap: 20,
    }}>
      <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 18px' }}>
          <ClockIcon pulse={pulse} />
          <div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 18, color: C.text }}>Brent is on the clock</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>Pick 18 of 50</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,150,163,0.25)', borderRadius: 10, padding: '10px 14px', fontFamily: BODY, fontSize: 14, color: C.muted }}>
            Search teams&hellip;
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.green, border: '1px solid rgba(34,197,94,0.5)', borderRadius: 10, padding: '10px 18px' }}>P4</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {teams.map((t, i) => <TeamCard key={t.abbr} {...t} o={seg(lb, 0.75 + i * 0.06, 1.15 + i * 0.06)} />)}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.muted, marginBottom: 4 }}>DRAFT BOARD</div>
        {picks.map((p) => (
          <div key={p.n} style={{
            display: 'flex', alignItems: 'center', gap: 12, borderRadius: 8, padding: '7px 12px',
            background: p.active ? `rgba(34,197,94,${0.14 + 0.1 * pulse})` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${p.active ? C.green : 'rgba(139,150,163,0.15)'}`,
          }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: p.active ? C.green : C.muted, width: 20 }}>{p.n}</span>
            <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 14, color: C.text, flex: 1 }}>{p.who}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: p.active ? 700 : 400, color: p.active ? C.green : C.muted }}>{p.team}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, p }) {
  const prog = on ? p : 0;
  return (
    <div style={{
      width: 44, height: 24, borderRadius: 999, position: 'relative', flexShrink: 0,
      background: on ? `rgba(245,158,11,${0.3 + 0.7 * prog})` : 'rgba(139,150,163,0.25)',
      border: `1px solid ${on ? C.gold : 'rgba(139,150,163,0.4)'}`,
    }}>
      <div style={{ position: 'absolute', top: 2, left: lerp(2, 22, prog), width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
    </div>
  );
}

function CaptainMockup({ lb, scale }) {
  const o = seg(lb, 0.5, 1.15);
  const toggleP = clamp01(seg(lb, 0.85, 1.3));
  const badgeP = clamp01(seg(lb, 0.95, 1.4));
  const badgeScale = Easing.easeOutBack ? Easing.easeOutBack(badgeP) : badgeP;
  return (
    <div style={{
      position: 'absolute', left: '50%', top: 520, transform: `translate(-50%,0) scale(${scale}) translateY(${lerp(18, 0, o)}px)`,
      opacity: o, width: 1000,
    }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,150,163,0.25)', borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139,150,163,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.muted }}>OSU</span>
            </div>
            <div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 20, color: C.text }}>Ohio State</div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: C.muted }}>Big Ten &middot; 1/2 captain uses</div>
            </div>
          </div>
          <div style={{ marginTop: 16, background: 'rgba(139,150,163,0.1)', borderRadius: 10, padding: '10px 14px', fontFamily: BODY, fontSize: 15, color: C.muted }}>
            vs #8 Penn State &middot; TBD
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 15, color: C.text }}>&#9733; Captain</div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>1 use left</div>
            </div>
            <Toggle on={false} p={0} />
          </div>
        </div>
        <div style={{ flex: 1.15, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.45)', borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139,150,163,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>GA</span>
              </div>
              <div>
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 20, color: C.text }}>Georgia</div>
                <div style={{ fontFamily: BODY, fontSize: 14, color: C.muted }}>SEC &middot; 0/2 captain uses</div>
              </div>
            </div>
            <div style={{
              fontFamily: BODY, fontWeight: 700, fontSize: 14, color: '#05070a', background: C.gold,
              borderRadius: 999, padding: '6px 14px', transform: `scale(${badgeScale})`, whiteSpace: 'nowrap',
            }}>&#9733; Captain</div>
          </div>
          <div style={{ marginTop: 16, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', fontFamily: BODY, fontSize: 15, color: C.text }}>
            <span style={{ color: C.green, fontWeight: 700 }}>W</span> vs #14 Ole Miss &middot; 34&ndash;17
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 24, fontFamily: BODY, fontSize: 14 }}>
            <span style={{ color: C.muted }}>Base: <span style={{ color: C.green, fontWeight: 700 }}>+3 pts</span></span>
            <span style={{ color: C.muted }}>Captain: <span style={{ color: C.gold, fontWeight: 700 }}>+6 pts &times;2</span></span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 15, color: C.gold }}>&#9733; Captain &times;2</div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>Doubles points this week</div>
            </div>
            <Toggle on={true} p={toggleP} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,150,163,0.2)', borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.muted}`, flexShrink: 0 }} />
        <div style={{ fontFamily: BODY, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
          <span style={{ color: C.text, fontWeight: 700 }}>Browse any week, not just the current one.</span> Jump to any week of the season to review results or set captains ahead of time.
        </div>
      </div>
    </div>
  );
}

function SaturdayMockup({ lb, scale }) {
  const o = seg(lb, 0.5, 1.15);
  const rows = [
    { name: 'Warren', color: '#f59e0b', score: 87, delta: '+9 wk', stats: '10 teams · +12 bonus · +6 wk7', you: true, max: 87 },
    { name: 'Brent', color: '#3b82f6', score: 73, delta: '+7 wk', stats: '10 teams · +8 bonus', max: 87 },
    { name: 'Jaws', color: '#a78bfa', score: 64, delta: '+4 wk', stats: '10 teams · +5 stats', max: 87 },
    { name: 'Evan', color: '#22c55e', score: 58, delta: '+3 wk', stats: '10 teams', max: 87 },
  ];
  return (
    <div style={{
      position: 'absolute', left: '50%', top: 468, transform: `translate(-50%,0) scale(${scale}) translateY(${lerp(18, 0, o)}px)`,
      opacity: o, width: 900, border: '1px solid rgba(139,150,163,0.25)', borderRadius: 16, overflow: 'hidden', background: '#0b0e14',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(139,150,163,0.15)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 9, height: 9, borderRadius: 9, background: '#ef4444' }} />
          <div style={{ width: 9, height: 9, borderRadius: 9, background: '#f59e0b' }} />
          <div style={{ width: 9, height: 9, borderRadius: 9, background: C.green }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, background: 'rgba(139,150,163,0.1)', borderRadius: 6, padding: '3px 10px' }}>cfb-fantasy.app</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid rgba(139,150,163,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 13, color: '#05070a' }}>G</span>
          </div>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: 1.5, color: C.text }}>GRIDIRON GLORY</span>
        </div>
        <div style={{ display: 'flex', gap: 18, fontFamily: BODY, fontSize: 13, color: C.muted }}>
          <span style={{ color: C.green, fontWeight: 700 }}>Standings</span>
          <span>My Roster</span>
          <span>Draft Room</span>
        </div>
      </div>
      <div style={{ padding: '16px 18px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 20, color: C.text }}>SEASON STANDINGS</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, background: 'rgba(139,150,163,0.15)', borderRadius: 999, padding: '3px 10px' }}>Week 8</span>
        </div>
        {rows.map((r, i) => {
          const p = seg(lb, 0.75 + i * 0.1, 1.35 + i * 0.1);
          const w = (r.score / r.max) * p;
          return (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontFamily: BODY, fontSize: 13, color: C.muted, width: 54 }}>{r.name}</span>
              <div style={{ flex: 1, height: 18, borderRadius: 5, background: 'rgba(139,150,163,0.1)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: `${w * 100}%`, background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                  <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: '#05070a' }}>{Math.round(r.score * p)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid rgba(139,150,163,0.15)' }}>
        {rows.map((r, i) => {
          const o2 = seg(lb, 1.3 + i * 0.08, 1.7 + i * 0.08);
          return (
            <div key={r.name} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', opacity: o2,
              borderBottom: i < rows.length - 1 ? '1px solid rgba(139,150,163,0.1)' : 'none',
            }}>
              <span style={{ fontFamily: MONO, fontSize: 14, color: i === 0 ? C.gold : C.muted, width: 16 }}>{i + 1}</span>
              <div style={{ width: 30, height: 30, borderRadius: 15, background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, color: '#05070a' }}>{r.name[0]}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 15, color: C.text }}>{r.name}</span>
                  {r.you && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.green, border: `1px solid ${C.green}`, borderRadius: 999, padding: '1px 7px' }}>YOU</span>}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 12, color: C.muted }}>{r.stats}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 19, color: C.text }}>{r.score}</div>
                <div style={{ fontFamily: BODY, fontSize: 11, color: C.muted }}>{r.delta}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FLOW_STAGES = [
  { period: 'JULY\u2013AUGUST', title: 'League Setup & Draft', desc: 'Commissioner creates the league and schedules a live snake draft.', color: C.green },
  { period: 'LATE AUGUST \u2013 NOVEMBER', title: 'Regular Season', desc: 'Scores update automatically every 30 minutes as you set weekly Captain and Spread picks.', color: C.green },
  { period: 'EARLY DECEMBER', title: 'Conference Championship Week', desc: "Conference title games are scored automatically, locking in the season's statistical bonuses.", color: C.gold },
  { period: 'DECEMBER \u2013 JANUARY', title: 'Bowl Season & CFP', desc: 'Bowl results, Heisman bonuses, and CFP milestones are awarded as they happen.', color: C.gold },
  { period: 'MID JANUARY', title: 'National Championship & Final Standings', desc: 'Final standings lock in and the season champion is crowned.', color: '#3b82f6' },
  { period: 'FEBRUARY \u2013 JULY', title: 'Offseason', desc: 'Player accounts and league history carry over automatically into the next draft.', color: C.muted },
];

function TimelineRow({ stage, isLast, reached, appearP, descP }) {
  const borderColor = reached ? stage.color : 'rgba(139,150,163,0.35)';
  return (
    <div style={{ display: 'flex', gap: 20, opacity: seg(appearP, 0, 1) }}>
      <div style={{ width: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
        <div style={{
          width: 16, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 4, position: 'relative',
          border: `2px solid ${borderColor}`, boxShadow: reached ? `0 0 12px ${stage.color}66` : 'none',
        }}>
          <div style={{ position: 'absolute', inset: 2, borderRadius: 6, background: stage.color, opacity: descP }} />
        </div>
        {!isLast && <div style={{ flex: 1, width: 2, marginTop: 6, background: reached ? stage.color : 'rgba(139,150,163,0.2)' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: reached ? stage.color : C.muted, marginBottom: 4 }}>{stage.period}</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 20, color: C.text, marginBottom: 4 }}>{stage.title}</div>
        <div style={{ maxHeight: descP * 36, opacity: descP, overflow: 'hidden' }}>
          <div style={{ fontFamily: BODY, fontSize: 17, lineHeight: 1.4, color: C.muted, width: 800 }}>{stage.desc}</div>
        </div>
      </div>
    </div>
  );
}

function SeasonFlowBeat({ lb }) {
  const introEnd = 0.9;
  const stageDur = 1.0;
  return (
    <React.Fragment>
      <Headline text="A SEASON." lb={lb} color={C.text} />
      <Subtext text="Gridiron Glory runs the full CFB calendar — from preseason setup through the National Championship in January." lb={lb} />
      <div style={{ position: 'absolute', left: '50%', top: 500, width: 900, transform: 'translate(-50%,0)' }}>
        {FLOW_STAGES.map((stage, i) => {
          const start = introEnd + i * stageDur;
          const isLastStage = i === FLOW_STAGES.length - 1;
          const appearP = seg(lb, start, start + 0.25);
          const expand = seg(lb, start + 0.15, start + 0.55);
          return (
            <TimelineRow key={stage.title} stage={stage} isLast={isLastStage} reached={appearP > 0} appearP={appearP} descP={expand} />
          );
        })}
      </div>
    </React.Fragment>
  );
}

const BEATS = [
  { key: 'Draft', headline: 'A DRAFT.', sub: 'Real college football teams, picked live with your league.', accent: C.green, Mockup: DraftMockup },
  { key: 'Captain', headline: 'A CAPTAIN.', sub: 'Name a captain before kickoff and their points double.', accent: C.green, Mockup: CaptainMockup },
  { key: 'Saturday', headline: 'A SATURDAY.', sub: 'Real games decide it — scores update live, all day.', accent: C.green, Mockup: SaturdayMockup },
];

function Piece({ showGrid, glow, density }) {
  const { T, CUES, authoredTotal } = useComposition();
  const total = authoredTotal || 30;
  const order = ['Draft', 'Captain', 'Saturday'];
  const scale = density === 'roomy' ? 1.1 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <PerspectiveGridLayer T={T} cues={CUES} total={total} show={showGrid} />
      <Shot from={0} to={CUES.Draft || 2.5}>
        <OpeningLockup T={T} />
      </Shot>
      {order.map((key, i) => {
        const b = BEATS[i];
        const start = CUES[key] || 0;
        const end = i < order.length - 1 ? (CUES[order[i + 1]] || start) : (CUES.SeasonFlow || start);
        const lb = T - start;
        return (
          <Shot key={key} from={start} to={end}>
            <Headline text={b.headline} lb={lb} color={b.accent === C.gold ? C.gold : C.text} />
            <Subtext text={b.sub} lb={lb} />
            <b.Mockup lb={lb} scale={scale} />
          </Shot>
        );
      })}
      <Shot from={CUES.Draft || 2.5} to={CUES.SeasonFlow || total}>
        <CornerLabel T={T} />
      </Shot>
      <Shot from={CUES.SeasonFlow || total} to={CUES.Closing || total}>
        <SeasonFlowBeat lb={T - (CUES.SeasonFlow || 0)} />
      </Shot>
      <Shot from={CUES.Closing || total} to={total}>
        <ClosingLockup T={T} cueStart={CUES.Closing || total} />
      </Shot>
    </div>
  );
}

function GridironAnimation() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      <CompositionStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg} hideControls>
        <Piece showGrid={t.showBackgroundGrid} glow={t.accentIntensity} density={t.mockupDensity} />
      </CompositionStage>
      <TweaksPanel>
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
        <TweakSection label="Look" />
        <TweakToggle label="Perspective grid accents" value={t.showBackgroundGrid} onChange={(v) => setTweak('showBackgroundGrid', v)} />
        <TweakSlider label="Glow intensity" value={t.accentIntensity} min={0} max={1} step={0.1} onChange={(v) => setTweak('accentIntensity', v)} />
        <TweakRadio label="Mockup density" value={t.mockupDensity} options={['compact', 'roomy']} onChange={(v) => setTweak('mockupDensity', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.GridironAnimation = GridironAnimation;
