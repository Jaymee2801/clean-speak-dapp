import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadModel, runInference, verifyOnChain,
  encodeFeatures, getSeverity, SEVERITY, PRESETS, SIGNAL_DEFS,
} from './model';
import './App.css';

/* ── Radial threat display ────────────────────────────────────────────── */
function ThreatRadar({ encoded, severity }) {
  const cx = 110, cy = 110, r = 80;
  const axes = SIGNAL_DEFS.length;

  const point = (val, idx) => {
    const angle = (Math.PI * 2 * idx) / axes - Math.PI / 2;
    return [cx + val * r * Math.cos(angle), cy + val * r * Math.sin(angle)];
  };

  const polygon = encoded.map((v, i) => point(v, i)).map(p => p.join(',')).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="radar-wrap">
      <svg viewBox="0 0 220 220" className="radar-svg">
        {/* Grid rings */}
        {gridLevels.map(level => {
          const pts = Array.from({ length: axes }, (_, i) => point(level, i))
            .map(p => p.join(',')).join(' ');
          return (
            <polygon key={level} points={pts} fill="none"
              stroke={level === 1.0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}
              strokeWidth="1" />
          );
        })}

        {/* Axis lines */}
        {SIGNAL_DEFS.map((_, i) => {
          const [x, y] = point(1, i);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />;
        })}

        {/* Data polygon */}
        <polygon
          points={polygon}
          fill={severity.color + '22'}
          stroke={severity.color}
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 8px ${severity.color}88)`, transition: 'all 0.4s ease' }}
        />

        {/* Data points */}
        {encoded.map((v, i) => {
          const [x, y] = point(v, i);
          return (
            <circle key={i} cx={x} cy={y} r="4"
              fill={severity.color}
              style={{ filter: `drop-shadow(0 0 4px ${severity.color})` }} />
          );
        })}

        {/* Axis labels */}
        {SIGNAL_DEFS.map((def, i) => {
          const [x, y] = point(1.28, i);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              className="radar-label" fill="rgba(255,255,255,0.45)">
              {def.label.toUpperCase()}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Score arc display ────────────────────────────────────────────────── */
function ScoreArc({ score, severity }) {
  const circumference = 2 * Math.PI * 54;
  const dash = score * circumference * 0.75;
  const offset = circumference * 0.125;

  return (
    <div className="arc-wrap">
      <svg viewBox="0 0 140 130" className="arc-svg">
        {/* Background arc (270 degrees) */}
        <circle cx="70" cy="75" r="54" fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-225deg)', transformOrigin: '70px 75px' }}
        />
        {/* Severity color zones (faint) */}
        {SEVERITY.map((s) => {
          const segLen = (s.max - s.min) * circumference * 0.75;
          const segOff = offset - s.min * circumference * 0.75;
          return (
            <circle key={s.label} cx="70" cy="75" r="54" fill="none"
              stroke={s.color} strokeWidth="10" opacity="0.12"
              strokeDasharray={`${segLen} ${circumference - segLen}`}
              strokeDashoffset={segOff}
              style={{ transform: 'rotate(-225deg)', transformOrigin: '70px 75px' }}
            />
          );
        })}
        {/* Active fill */}
        <circle cx="70" cy="75" r="54" fill="none"
          stroke={severity.color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={offset}
          style={{
            transform: 'rotate(-225deg)', transformOrigin: '70px 75px',
            filter: `drop-shadow(0 0 10px ${severity.color}99)`,
            transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s',
          }}
        />
        <text x="70" y="68" textAnchor="middle" className="arc-score" fill={severity.color}>
          {(score * 100).toFixed(0)}
        </text>
        <text x="70" y="86" textAnchor="middle" className="arc-pct" fill={severity.color}>
          %
        </text>
      </svg>

      <div className="arc-badge" style={{ color: severity.color, borderColor: severity.color + '55', background: severity.bg }}>
        <span className="arc-tag">{severity.tag}</span>
        <span className="arc-label">{severity.label}</span>
      </div>
      <div className="arc-desc">{severity.desc}</div>
    </div>
  );
}

/* ── Chain proof ──────────────────────────────────────────────────────── */
function ChainProof({ proof, verifying }) {
  if (verifying) {
    return (
      <div className="chain-box verifying">
        <div className="chain-spin" />
        <div>
          <div className="chain-title verifying-text">SUBMITTING TO OPENGRADIENT…</div>
          <div className="chain-sub">Generating ZKML proof · awaiting validator consensus</div>
        </div>
      </div>
    );
  }
  if (!proof) return null;

  const rows = [
    ['NETWORK',   proof.network],
    ['MODE',      proof.inferMode],
    ['BLOCK',     '#' + proof.blockNumber.toLocaleString()],
    ['MODEL CID', proof.modelCid.slice(0, 22) + '…'],
    ['TX HASH',   proof.txHash.slice(0, 22) + '…'],
    ['TIME',      new Date(proof.timestamp).toLocaleTimeString()],
  ];

  return (
    <div className="chain-box verified">
      <div className="chain-header">
        <span className="chain-check">✓</span>
        <span className="chain-verified-title">ON-CHAIN VERIFIED</span>
        <span className="chain-zkml">ZKML</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="chain-row">
          <span className="chain-key">{k}</span>
          <span className="chain-val">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────── */
export default function App() {
  const defaults = Object.fromEntries(SIGNAL_DEFS.map(d => [d.key, 10]));

  const [vals, setVals] = useState(defaults);
  const [score, setScore] = useState(null);
  const [proof, setProof] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [flashClass, setFlashClass] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    loadModel().then(() => setModelReady(true)).catch(console.error);
  }, []);

  const encoded = encodeFeatures(vals);
  const severity = score !== null ? getSeverity(score) : null;

  const doInfer = useCallback(async (currentVals) => {
    if (!modelReady) return;
    try {
      const features = encodeFeatures(currentVals);
      const result = await runInference(features);
      setScore(result);
      setProof(null);
      const sev = getSeverity(result);
      if (result >= 0.65) {
        setFlashClass('flash-danger');
        setTimeout(() => setFlashClass(''), 600);
      } else if (result >= 0.45) {
        setFlashClass('flash-warn');
        setTimeout(() => setFlashClass(''), 600);
      }
      void sev;
    } catch (err) {
      console.error('Inference error:', err);
    }
  }, [modelReady]);

  useEffect(() => {
    if (!modelReady) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doInfer(vals), 200);
    return () => clearTimeout(debounceRef.current);
  }, [vals, modelReady, doInfer]);

  const handleChange = (key, value) => {
    setVals(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  };

  const applyPreset = (preset) => {
    setVals(preset.values);
    setActivePreset(preset.id);
    setProof(null);
  };

  const doVerify = useCallback(async () => {
    if (score === null || verifying) return;
    setVerifying(true);
    try {
      const result = await verifyOnChain(encoded, score);
      setProof(result);
    } catch (err) {
      console.error('Verify error:', err);
    } finally {
      setVerifying(false);
    }
  }, [score, encoded, verifying]);

  return (
    <div className={'app ' + flashClass}>
      <div className="noise-overlay" />
      <div className="scan-bg" />

      {/* Header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="logo">
            <div className="logo-hex">
              <span>TX</span>
            </div>
            <div>
              <div className="logo-name">ToxiGuard</div>
              <div className="logo-sub">Content Toxicity Detector · OpenGradient Network</div>
            </div>
          </div>
          <div className={'status-pill ' + (modelReady ? 'live' : 'wait')}>
            <span className="sp-dot" />
            {modelReady ? 'MODEL LIVE' : 'LOADING…'}
          </div>
        </div>
      </header>

      <main className="main">
        {/* LEFT — controls */}
        <aside className="left-col">

          {/* Presets */}
          <div className="panel-label">CONTENT PRESETS</div>
          <div className="presets">
            {PRESETS.map(p => (
              <button
                key={p.id}
                className={'preset-btn ' + (activePreset === p.id ? 'active' : '')}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Signal sliders */}
          <div className="panel-label" style={{ marginTop: '1.5rem' }}>TOXICITY SIGNALS</div>
          <div className="signals">
            {SIGNAL_DEFS.map((def, idx) => {
              const val = vals[def.key];
              const encVal = encoded[idx];
              const pct = val / 100;
              const sigColor = encVal > 0.65 ? '#ff0044' : encVal > 0.4 ? '#ffaa00' : '#39ff14';
              return (
                <div key={def.key} className="signal-row">
                  <div className="sig-header">
                    <span className="sig-icon">{def.icon}</span>
                    <span className="sig-label">{def.label}</span>
                    <div className="sig-enc-wrap">
                      <div className="sig-enc-bar">
                        <div className="sig-enc-fill" style={{ width: (encVal * 100) + '%', background: sigColor }} />
                      </div>
                    </div>
                    <span className="sig-val" style={{ color: sigColor }}>{val}</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1} value={val}
                    onChange={e => handleChange(def.key, parseInt(e.target.value))}
                    className="sig-slider"
                    style={{ '--pct': (pct * 100) + '%', '--col': sigColor }}
                  />
                  <div className="sig-hint">{def.hint}</div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT — output */}
        <section className="right-col">
          <div className="panel-label">THREAT ANALYSIS</div>

          {score !== null && severity ? (
            <>
              {/* Top row: arc + radar */}
              <div className="analysis-row">
                <ScoreArc score={score} severity={severity} />
                <ThreatRadar encoded={encoded} severity={severity} />
              </div>

              {/* Severity ladder */}
              <div className="severity-ladder">
                {SEVERITY.map(s => {
                  const active = s.label === severity.label;
                  return (
                    <div
                      key={s.label}
                      className={'sev-item ' + (active ? 'sev-active' : '')}
                      style={active ? { borderColor: s.color, background: s.bg, color: s.color } : {}}
                    >
                      <span className="sev-tag" style={active ? { background: s.color, color: '#0e0e0e' } : {}}>
                        {s.tag}
                      </span>
                      <span className="sev-label">{s.label}</span>
                      <span className="sev-range">
                        {Math.round(s.min * 100)}–{Math.round(Math.min(s.max, 1) * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Tensor readout */}
              <div className="tensor-row">
                <span className="t-key">IN  float32[1,5]</span>
                <span className="t-val">[{encoded.map(v => v.toFixed(4)).join(', ')}]</span>
              </div>
              <div className="tensor-row">
                <span className="t-key">OUT float32[1,1]</span>
                <span className="t-val" style={{ color: severity.color }}>[{score.toFixed(8)}]</span>
              </div>

              {/* Verify */}
              <div className="verify-section">
                <div className="panel-label">OPENGRADIENT VERIFICATION</div>
                {!proof && !verifying && (
                  <button className="btn-verify" onClick={doVerify}
                    style={{ '--vc': severity.color }}>
                    <span>⛓</span>
                    VERIFY ON-CHAIN VIA ZKML
                  </button>
                )}
                <ChainProof proof={proof} verifying={verifying} />
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-hex">
                <div className="hex-inner" />
              </div>
              <div className="empty-title">AWAITING ANALYSIS</div>
              <div className="empty-sub">Adjust toxicity signals to begin detection</div>
            </div>
          )}
        </section>
      </main>

      <footer className="ftr">
        <span>toxicity_detector.onnx</span>
        <span className="fd">·</span>
        <span>ONNX Runtime Web</span>
        <span className="fd">·</span>
        <span>OpenGradient Alpha Testnet</span>
        <span className="fd">·</span>
        <span>For research use only</span>
      </footer>
    </div>
  );
}
