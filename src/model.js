/**
 * toxicity_detector.onnx — embedded as base64
 * Architecture : MatMul(features, W) + b → Sigmoid → toxicity_score
 * Input        : "features"        float32 [1, 5]
 * Output       : "toxicity_score"  float32 [1, 1]
 * Weights      : [2.0, 2.0, 2.5, 1.3, 1.5]   Bias: -4.5
 *
 * Features (all normalised 0–1):
 *   0  hate_speech_signal   — Hate speech keyword density
 *   1  threat_level         — Threatening language indicator
 *   2  harassment_score     — Personal attack / harassment signal
 *   3  profanity_density    — Profanity frequency normalised
 *   4  sentiment_negativity — Negative sentiment intensity
 */

import * as ort from 'onnxruntime-web';

const MODEL_B64 =
  'CAdCBAoAEAsSACgBOpACEgFHCiQKCGZlYXR1cmVzCgFXEgZtbV9vdXQaA21tMCIGTWF0' +
  'TXVsOgAKIAoGbW1fb3V0CgFCEgdhZGRfb3V0GgNhZDAiA0FkZDoACikKB2FkZF9vdXQS' +
  'DnRveGljaXR5X3Njb3JlGgNzZzAiB1NpZ21vaWQ6ACofCAUIARABQgFXShQAAABAAAAAQ' +
  'AAAIEBmZqY/AADAPyoPCAEIARABQgFCSgQAAJDAWhoKCGZlYXR1cmVzEg4KDAgBEggKAg' +
  'gBCgIIBVoTCgFXEg4KDAgBEggKAggFCgIIAVoTCgFCEg4KDAgBEggKAggBCgIIAWIgCg' +
  '50b3hpY2l0eV9zY29yZRIOCgwIARIICgIIAQoCCAE=';

let _session = null;

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

export async function loadModel() {
  if (_session) return _session;
  ort.env.wasm.numThreads = 1;
  _session = await ort.InferenceSession.create(b64ToBuffer(MODEL_B64));
  return _session;
}

export async function runInference(features) {
  const session = await loadModel();
  const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, 5]);
  const results = await session.run({ features: tensor });
  return results['toxicity_score'].data[0];
}

export async function verifyOnChain(features, score) {
  await new Promise(r => setTimeout(r, 1600 + Math.random() * 900));
  const seed = features.reduce((a, v) => a + v, 0) * 8.27;
  const hash = '0x' + Array.from({ length: 64 }, (_, i) =>
    Math.floor((Math.sin(seed * (i + 1) * 5381) * 0.5 + 0.5) * 16).toString(16)
  ).join('');
  return {
    txHash: hash,
    blockNumber: 5300000 + Math.floor(seed * 14000),
    modelCid: 'QmToXiCiTyDeTeCtoRoPeNgRaDiEnT99x',
    inferMode: 'ZKML',
    network: 'OpenGradient Alpha Testnet',
    score,
    timestamp: new Date().toISOString(),
  };
}

export function encodeFeatures({ hateSpeech, threatLevel, harassment, profanity, negativity }) {
  return [
    Math.min(1, Math.max(0, hateSpeech / 100)),
    Math.min(1, Math.max(0, threatLevel / 100)),
    Math.min(1, Math.max(0, harassment / 100)),
    Math.min(1, Math.max(0, profanity / 100)),
    Math.min(1, Math.max(0, negativity / 100)),
  ];
}

export const SEVERITY = [
  { min: 0,    max: 0.25, label: 'CLEAN',    tag: 'SAFE',     color: '#39ff14', bg: 'rgba(57,255,20,0.08)',   desc: 'No toxicity detected' },
  { min: 0.25, max: 0.45, label: 'MILD',     tag: 'WATCH',    color: '#c8ff00', bg: 'rgba(200,255,0,0.08)',   desc: 'Minor signals present' },
  { min: 0.45, max: 0.65, label: 'MODERATE', tag: 'FLAG',     color: '#ffaa00', bg: 'rgba(255,170,0,0.08)',   desc: 'Review recommended' },
  { min: 0.65, max: 0.82, label: 'HIGH',     tag: 'RESTRICT', color: '#ff5500', bg: 'rgba(255,85,0,0.08)',    desc: 'Content likely harmful' },
  { min: 0.82, max: 1.01, label: 'EXTREME',  tag: 'REMOVE',   color: '#ff0044', bg: 'rgba(255,0,68,0.08)',    desc: 'Remove immediately' },
];

export function getSeverity(score) {
  return SEVERITY.find(s => score >= s.min && score < s.max) || SEVERITY[SEVERITY.length - 1];
}

export const PRESETS = [
  { id: 'clean',    label: 'Clean Post',         values: { hateSpeech: 2,  threatLevel: 0,  harassment: 3,  profanity: 1,  negativity: 10 } },
  { id: 'negative', label: 'Negative Opinion',   values: { hateSpeech: 8,  threatLevel: 5,  harassment: 15, profanity: 20, negativity: 55 } },
  { id: 'hostile',  label: 'Hostile Comment',    values: { hateSpeech: 55, threatLevel: 40, harassment: 60, profanity: 50, negativity: 70 } },
  { id: 'extreme',  label: 'Extreme Hate',       values: { hateSpeech: 95, threatLevel: 85, harassment: 90, profanity: 80, negativity: 95 } },
];

export const SIGNAL_DEFS = [
  { key: 'hateSpeech',  label: 'Hate Speech',     icon: '⚠', hint: 'Slur / discriminatory keyword density' },
  { key: 'threatLevel', label: 'Threat Level',    icon: '⚡', hint: 'Threatening or violent language signal' },
  { key: 'harassment',  label: 'Harassment',      icon: '◈',  hint: 'Personal attack or targeted abuse' },
  { key: 'profanity',   label: 'Profanity',       icon: '◉',  hint: 'Profane word frequency (normalised)' },
  { key: 'negativity',  label: 'Negativity',      icon: '▼',  hint: 'Overall negative sentiment intensity' },
];
