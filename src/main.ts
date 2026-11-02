import * as THREE from 'three';
import { createWorld } from './render/world';
import { createVegetable } from './render/vegetables';
import { createEffects, type ThrowEffects } from './render/effects';
import { createChaseCamera } from './render/chase-camera';
import { getImpactResponse } from './simulation/impact';
import { playbackRate, flightTimeAt } from './simulation/playback';
import { VEGETABLES, PHYSICS, simulateThrow, sampleTrajectory, type ThrowResult } from './simulation/physics';
import { CityExperiment, CITY_OBSERVERS } from './simulation/city';
import { flightEnergyBudget, machAngle } from './simulation/waves';
import { createCityView } from './render/city';
import { airFlow, DEFAULT_BREAKUP } from './simulation/flow';
import { impactPulse, pressureAt } from './simulation/acoustics';
import { createAirborneFragments } from './render/airborne';
import { mountTheoryPanel } from './ui/theory';
import './style.css';

const icons: Record<string, string> = {
  tomato: '<path fill="#e35e42" d="M12 35C9 15 30 15 32 21c12-11 28-1 22 17-4 17-15 19-22 14-12 5-20-4-20-17Z"/><path fill="#49683c" d="m32 12 3 10 11-4-8 9 5 5-12-4-10 5 4-8-6-6 10 3Z"/><path fill="none" stroke="#f29c78" stroke-width="3" stroke-linecap="round" d="M18 33q0-6 6-7"/>',
  carrot: '<path fill="#ed8b3e" d="M19 25q10-13 22 1c0 5-13 27-22 31-4-8-5-26 0-32Z"/><path fill="#638449" d="M29 24Q9 7 21 8l10 12Q23 0 34 4l1 16Q42 0 47 9L36 26Z"/><path stroke="#c4652a" stroke-width="2" d="m20 32 8 4m-9 5 6 3"/>',
  cucumber: '<path fill="#4b7950" d="M14 46 33 15C43 2 57 16 49 29L30 55C20 67 5 58 14 46Z"/><path fill="none" stroke="#94ac68" stroke-width="3" stroke-linecap="round" d="m21 48 20-29"/><g fill="#b1bb70"><circle cx="24" cy="35" r="1.3"/><circle cx="37" cy="32" r="1.3"/><circle cx="30" cy="47" r="1.3"/></g>',
  eggplant: '<path fill="#756084" d="M27 20c18-9 28 12 18 27C36 62 13 59 15 44c1-10 12-13 12-24Z"/><path fill="#54794b" d="m26 23 1-13 6 2-1 7 11-2-5 7 6 7-12-3-6 6-1-8-7-1Z"/><path fill="none" stroke="#a38ca8" stroke-width="3" stroke-linecap="round" d="M21 43q0 6 6 8"/>',
  pumpkin: '<path fill="#68754a" d="m30 20-1-11 7-2 1 14Z"/><ellipse fill="#d18b38" cx="32" cy="37" rx="25" ry="20"/><ellipse fill="#e8a449" cx="24" cy="37" rx="12" ry="20"/><ellipse fill="#e6a047" cx="41" cy="37" rx="11" ry="20"/><ellipse fill="#f0b254" cx="32" cy="37" rx="7" ry="20"/>',
  cabbage: '<circle fill="#84a268" cx="32" cy="34" r="25"/><path fill="#b1c786" d="M13 24q28-17 36 4L35 55Q8 53 13 24Z"/><path fill="#98b378" d="M50 19q16 22-10 37L25 31Z"/><path fill="none" stroke="#d6dda9" stroke-width="2" d="m16 25 20 27m-7-12-10-1m16 9 3-18m4 16 8-22"/>',
};
const vegetableIcon = (id: string) => `<svg viewBox="0 0 64 64" aria-hidden="true">${icons[id]}</svg>`;
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="やさい投擲実験所 ホーム"><span class="brand-mark">${vegetableIcon('tomato')}</span>やさい投擲実験所<span class="brand-en">VELOCITY LAB</span></a>
    <nav aria-label="メニュー"><button class="text-button" id="model-button">物理モデル <span>↗</span></button><button class="sound-button" id="sound-button" aria-label="音をオンにする" aria-pressed="false">音 OFF</button></nav>
  </header>
  <main>
    <div id="scene" role="img" aria-label="街中で野菜と衝撃波を観察する3D実験場"></div>
    <div class="scene-wash" aria-hidden="true"></div>
    <section class="hero" aria-label="ゲームタイトル"><div class="eyebrow"><i></i> PLAY WITH YOUR FOOD.</div><h1>野菜 × 街。</h1><p>その一投は、音速を超える。</p></section>
    <section class="speed-readout" aria-label="投げる速度"><div class="eyebrow" id="speed-label">投げる速度</div><div class="speed-number"><span id="speed">0</span><span class="speed-unit">km/h</span></div><div class="mach-line"><span id="mach">MACH 0.00</span><span class="supersonic" id="supersonic" hidden>超音速</span></div></section>
    <div class="range-info"><span class="live-dot"></span>市街地 · 15°C<span class="info-divider">/</span>無風<span class="info-divider">/</span>的まで <strong>12 m</strong></div>
    <div class="view-tools"><button id="view-button" aria-pressed="false">街を俯瞰</button><button id="waves-button" aria-pressed="true">波 ON</button></div><div class="wave-key" id="wave-key">青：超音速の波 ／ 橙：衝突音<br>青の圧力は未計算 · 橙は仮定で試算</div><div class="flight-tag" id="flight-tag" hidden></div>
    <section class="outcome" id="outcome" aria-live="polite" hidden><div class="eyebrow" id="result-eyebrow">EXPERIMENT 001</div><h2 id="result-title">命中。</h2><div class="result-metrics"><div><span>衝突速度</span><strong id="impact-speed"></strong></div><div><span>運動エネルギー</span><strong id="impact-energy"></strong></div><div><span>飛行時間</span><strong id="impact-time"></strong></div></div><button class="replay-button" id="replay-button">↻ スローで見る</button><button class="replay-button" id="city-report-button">観測結果 ↗</button><span id="city-summary" class="effect-note">街を観測中</span></section>
    <div class="scene-message" id="scene-message" role="status">実験場を準備中…</div>
    <div class="control-dock">
      <section class="vegetable-panel" aria-labelledby="vegetable-heading"><div class="panel-heading"><h2 id="vegetable-heading"><span class="step-number">01</span> 野菜を選ぶ</h2><span class="mass" id="mass">150 g</span></div><div class="vegetable-list" id="vegetable-list">${VEGETABLES.map((v, i) => `<button class="vegetable-button${i === 0 ? ' selected' : ''}" data-vegetable="${v.id}" aria-pressed="${i === 0}" aria-label="${v.name}を選ぶ">${vegetableIcon(v.id)}<span>${v.name}</span></button>`).join('')}</div></section>
      <section class="throw-panel" aria-labelledby="throw-heading"><div class="panel-heading"><h2 id="throw-heading"><span class="step-number">02</span> タイミングよく投げる</h2><button class="settings-button" id="settings-button" aria-label="実験設定を開く"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6m6 4v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>設定</span></button></div><div class="throw-row"><div class="gauge-wrap"><div class="gauge" id="gauge" role="meter" aria-label="速度ゲージ" aria-valuemin="0" aria-valuemax="2000" aria-valuenow="0"><div class="gauge-fill" id="gauge-fill"></div><div class="sonic-mark" title="音速"></div><div class="gauge-ticks"></div><div class="gauge-needle" id="gauge-needle"></div></div><div class="gauge-labels"><span>0</span><span class="sonic-label">音速</span><span>2000 <small>km/h</small></span></div></div><button class="throw-button" id="throw-button" disabled><span>準備中</span>${arrow}</button></div><div class="control-hint"><span id="control-hint">タップで速度を決定</span><span class="keyboard-hint"><kbd>SPACE</kbd> でも投げる</span></div></section>
    </div>
  </main>
  <footer><span>0 → 2000 km/h <span class="footer-dot">·</span> VEGETABLE VELOCITY LAB</span><span>重力・空気抵抗を計算 <span class="footer-dot">·</span> 破壊・飛行中の形状は仮定</span></footer>
  <dialog id="settings-dialog"><div class="dialog-heading"><h2>実験設定</h2><button class="close-button" data-close="settings-dialog" aria-label="設定を閉じる">×</button></div><form id="experiment-form"><label class="input-label" for="exact-speed">速度を指定</label><div class="number-input"><input type="number" id="exact-speed" min="0" max="2000" step="1" value="2000" required inputmode="numeric"><span>km/h</span></div><div class="presets">${[0, 100, 1000, 2000].map(v => `<button type="button" data-preset="${v}">${v}</button>`).join('')}</div><label class="input-label angle-label" for="angle">投げる角度 <output id="angle-output">2°</output></label><input type="range" id="angle" min="-3" max="5" step="1" value="2"><div class="range-labels"><span>−3°</span><span>5°</span></div><details class="material-settings"><summary>物性の仮定</summary><label class="toggle-label"><input type="checkbox" id="air-breakup" checked> 空中崩壊を計算</label><label class="input-label" for="strength">有効強度（仮定）<output id="strength-output">150 kPa</output></label><input type="range" id="strength" min="50" max="1000" step="25" value="150"><p>全野菜に共通の仮定値。実測強度ではありません。</p><label class="input-label" for="acoustic-share">衝突音への変換率（仮定）</label><select id="acoustic-share"><option value="0.0001">0.01%</option><option value="0.001" selected>0.1%</option><option value="0.01">1%</option></select><p>低い値・高い値でも試して比較できます。</p></details><button type="submit" class="throw-button exact-throw"><span>この速度で投げる</span>${arrow}</button></form><p class="dialog-note">通常は実時間。スローは再生時のみ。<br>破壊は材質を仮定した演出です。</p></dialog>
  <dialog id="model-dialog"><div class="dialog-heading"><h2>物理モデル</h2><button class="close-button" data-close="model-dialog" aria-label="物理モデルを閉じる">×</button></div><p class="model-lead">重力と、音速付近の変化を含む<br>空気抵抗を計算。</p><div class="formula">F<sub>D</sub> = ½ ρ C<sub>D</sub> A v²</div><p>15°C・海面上・無風。<br>音速は約1,225 km/h。</p><p>形・重さ・抵抗係数は代表的な仮定値。音速付近の抵抗増加も近似です。</p><p>形を保って発射された野菜に、空気の圧縮による荷重がかかる近似です。有効強度を超えた負荷が続くと32個の破片群に変わり、平均軌道の空気抵抗が増えます。強度150kPaは全野菜共通の仮定値。皮・果肉・葉の違いは未解決です。</p><p>先端の圧力・空気温度は理想気体の垂直衝撃波とよどみ点の式で計算。野菜内部や離れた窓の圧力・温度ではありません。青い波は代表波面です。</p><p>衝突音はエネルギーの0.1%・幅1msを仮定した球面の弱い波として試算。反射・回折・飛行中のソニックブームの圧力・建物倒壊は未計算です。窓への直撃は完全捕捉と仮の破損閾値を使います。</p><a class="source-link" href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/" target="_blank" rel="noopener noreferrer">NASA · 抵抗の式 ↗</a><a class="source-link" href="https://www.grc.nasa.gov/www/k-12/BGP/mach.html" target="_blank" rel="noopener noreferrer">NASA · マッハ数と波 ↗</a><a class="source-link" href="https://www.grc.nasa.gov/WWW/k-12/airplane/normal.html" target="_blank" rel="noopener noreferrer">NASA · 衝撃波の式 ↗</a></dialog>
  <dialog id="city-dialog"><div class="dialog-heading"><h2>街への影響</h2><button class="close-button" data-close="city-dialog" aria-label="観測を閉じる">×</button></div><div id="city-report"></div><p class="dialog-note">圧力の試算は衝突音のみ。反射・倒壊は未計算。<br>崩壊・窓の破損は実測未検証です。</p></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const sceneContainer = $('scene');
const throwButton = $<HTMLButtonElement>('throw-button');
const settingsDialog = $<HTMLDialogElement>('settings-dialog');
const modelDialog = $<HTMLDialogElement>('model-dialog');
const cityDialog = $<HTMLDialogElement>('city-dialog');
const cityExperiment = new CityExperiment();
let cityView: ReturnType<typeof createCityView>;
let overview = false;
let wavesVisible = true;
let experimentTime = 0;
let waveHeard = false;
let lastCityReport = '';
let strengthPa = DEFAULT_BREAKUP.strengthPa;
let acousticEfficiency = 0.001;
let shotAcousticEfficiency = 0.001;
let shotBreakupEnabled = true;
let shotAngleDeg = 2;
let projectileIsFragmented = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let selectedId = 'tomato';
let angleDeg = 2;
let state: 'loading' | 'ready' | 'flying' | 'impact' | 'result' = 'loading';
let meterClock = 0.2;
let gaugeSpeed = 400;
let result: ThrowResult | null = null;
let shotNumber = 0;
let flightElapsed = 0;
let playbackSpeed = 1;
let aftermathElapsed = 0;
let damage: ReturnType<typeof getImpactResponse> | null = null;
let isReplay = false;
let sound = false;
let audio: AudioContext | null = null;
let world: ReturnType<typeof createWorld>;
let effects: ThrowEffects;
let projectile: THREE.Group;
let chaseCamera: ReturnType<typeof createChaseCamera>;
let projectileRadius = 0.05;
let animationId = 0;
let lastFrame = performance.now();
let hidden = document.hidden;
const trailPoints: THREE.Vector3[] = [];

function number(value: number, digits = 0): string { return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
function setSpeed(speed: number, label = '投げる速度') {
  $('speed').textContent = number(speed);
  $('speed-label').textContent = label;
  $('mach').textContent = `MACH ${(speed / 3.6 / PHYSICS.speedOfSound).toFixed(2)}`;
  $('supersonic').hidden = speed < PHYSICS.speedOfSound * 3.6;
  $('gauge-fill').style.transform = `scaleX(${speed / 2000})`;
  $('gauge-needle').style.left = `${speed / 20}%`;
  $('gauge').setAttribute('aria-valuenow', String(Math.round(speed)));
}

function disposeProjectile() {
  if (!projectile) return;
  projectile.removeFromParent();
  projectile.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      if (projectile.userData.ownsMaterials) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
      // Vegetable materials are shared across models and remain cached.
    }
  });
}

function makeProjectile() {
  disposeProjectile();
  projectile = createVegetable(selectedId);
  projectileIsFragmented = false;
  projectile.position.set(0, PHYSICS.launchHeight, 0);
  world.scene.add(projectile);
  projectileRadius = new THREE.Box3().setFromObject(projectile).getBoundingSphere(new THREE.Sphere()).radius;
}

function ready() {
  state = 'ready';
  result = null;
  damage = null;
  effects.clear();
  cityExperiment.reset();
  cityView.reset();
  experimentTime = 0;
  waveHeard = false;
  trailPoints.length = 0;
  world.resetTarget();
  makeProjectile();
  chaseCamera.follow(projectile.position, new THREE.Vector3(0, 0, -1), projectileRadius);
  $('outcome').hidden = true;
  $('flight-tag').hidden = true;
  $('control-hint').textContent = 'タップで速度を決定';
  document.body.classList.remove('in-flight', 'has-result');
  throwButton.disabled = false;
  throwButton.querySelector('span')!.textContent = '投げる';
  document.querySelectorAll<HTMLButtonElement>('[data-vegetable]').forEach(b => b.disabled = false);
  $<HTMLButtonElement>('settings-button').disabled = false;
}

function tone(type: 'launch' | 'impact', energy = 0) {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain).connect(audio.destination);
    const now = audio.currentTime;
    oscillator.type = type === 'launch' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(type === 'launch' ? 220 : Math.min(120, 42 + Math.log10(energy + 1) * 15), now);
    oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
  } catch { /* Sound is optional. */ }
}

function launch(speed: number, replay = false) {
  if (!replay && state !== 'ready' && state !== 'result') return;
  if (replay && !result) return;
  if (!replay) {
    shotBreakupEnabled = $<HTMLInputElement>('air-breakup').checked;
    shotAngleDeg = angleDeg;
    shotAcousticEfficiency = acousticEfficiency;
    result = simulateThrow({ vegetableId: selectedId, speedKmh: speed, angleDeg }, { breakup: shotBreakupEnabled ? { strengthPa, fragmentCount: DEFAULT_BREAKUP.fragmentCount } : undefined });
    shotNumber++;
  }
  if (!result) return;
  isReplay = replay;
  state = 'flying';
  flightElapsed = 0;
  aftermathElapsed = 0;
  playbackSpeed = playbackRate(result.impact.time, replay);
  lastFrame = performance.now();
  effects.clear();
  cityExperiment.reset();
  cityView.reset();
  experimentTime = 0;
  waveHeard = false;
  world.resetTarget();
  cityView.start(result);
  trailPoints.length = 0;
  makeProjectile();
  chaseCamera.follow(projectile.position, new THREE.Vector3(0, 0, -1), projectileRadius);
  $('outcome').hidden = true;
  $('flight-tag').textContent = replay ? `REPLAY · ×${playbackSpeed.toFixed(3)}` : '実時間 · ×1';
  $('flight-tag').hidden = false;
  $('control-hint').textContent = '飛行中';
  document.body.classList.add('in-flight');
  document.body.classList.remove('has-result');
  setSpeed(result.launchSpeedKmh, '初速');
  throwButton.disabled = true;
  throwButton.querySelector('span')!.textContent = '飛行中';
  document.querySelectorAll<HTMLButtonElement>('[data-vegetable]').forEach(b => b.disabled = true);
  $<HTMLButtonElement>('settings-button').disabled = true;
  settingsDialog.close();
  tone('launch');
  // Present the close-up launch pose even when the whole flight lasts two frames.
  world.render();
}

function beginImpact() {
  if (!result) return;
  state = 'impact';
  aftermathElapsed = 0;
  const hit = result.impact;
  damage = getImpactResponse({ massKg: result.vegetable.massKg, speedKmh: hit.speedKmh, normalEnergyJ: hit.normalEnergyJ, kind: hit.kind, vegetableId: result.vegetable.id, radiusM: result.vegetable.radiusM });
  if (result.breakup && damage.vegetable === 'intact') damage = { ...damage, vegetable: 'split', fragmentCount: 32 };
  if (damage.vegetable !== 'intact') projectile.visible = false;
  else if (hit.kind === 'ground') {
    projectile.rotation.z = Math.PI / 2;
    projectile.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(projectile);
    projectile.position.y += 0.008 - bounds.min.y;
  }
  const point = new THREE.Vector3(hit.contactPoint.x, hit.contactPoint.y, hit.contactPoint.z);
  effects.impact({ position: point.clone().add(new THREE.Vector3(0, hit.kind === 'ground' ? 0.01 : 0, hit.kind === 'target' ? 0.02 : 0)), color: new THREE.Color(result.vegetable.color).getHex(), energyJ: hit.energyJ, kind: hit.kind, speedKmh: hit.speedKmh, response: damage, vegetableId: result.vegetable.id, massKg: result.vegetable.massKg, radiusM: result.vegetable.radiusM, incomingVelocity: new THREE.Vector3(hit.velocity.x, hit.velocity.y, hit.velocity.z) });
  if (hit.kind === 'target') world.setTargetDamage(hit.normalEnergyJ, hit.contactPoint.x, hit.contactPoint.y, damage);
  chaseCamera.impact(point, hit.kind === 'target', damage.severity);
  $('flight-tag').textContent = isReplay ? `IMPACT · ×${playbackSpeed.toFixed(3)}` : '実時間 · ×1';
  $('control-hint').textContent = '衝突';
  tone('impact', hit.energyJ);
}

function revealResult() {
  if (!result || !damage) return;
  state = 'result';
  const hit = result.impact;
  $('result-eyebrow').textContent = `EXPERIMENT ${String(shotNumber).padStart(3, '0')}${isReplay ? ' · REPLAY' : ''}`;
  $('result-title').textContent = hit.kind === 'target' ? damage.target === 'breached' ? '的に穴。' : damage.target === 'cracked' ? '的が割れた。' : '命中。' : hit.kind === 'ground' ? '地面に着地。' : '範囲外。';
  $('impact-speed').innerHTML = `${number(hit.speedKmh)} <small>km/h</small>`;
  $('impact-energy').innerHTML = hit.energyJ >= 1000 ? `${number(hit.energyJ / 1000, 1)} <small>kJ</small>` : `${number(hit.energyJ, 1)} <small>J</small>`;
  $('impact-time').innerHTML = `${number(hit.time, 3)} <small>s</small>`;
  $('outcome').hidden = false;
  $('flight-tag').hidden = true;
  $('control-hint').textContent = '野菜を変えて、もう一度';
  document.body.classList.remove('in-flight');
  document.body.classList.add('has-result');
  throwButton.disabled = false;
  throwButton.querySelector('span')!.textContent = 'もう一投';
  document.querySelectorAll<HTMLButtonElement>('[data-vegetable]').forEach(b => b.disabled = false);
  $<HTMLButtonElement>('settings-button').disabled = false;
}

function frame(now: number) {
  const delta = Math.max(0, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!hidden) {
    let aftermathDelta = delta;
    if (state === 'flying' || state === 'impact' || state === 'result') experimentTime += delta * playbackSpeed;
    if (state === 'ready' && !settingsDialog.open && !modelDialog.open && !cityDialog.open) {
      meterClock += delta * 0.57;
      gaugeSpeed = Math.round(2000 * (1 - Math.abs(meterClock % 2 - 1)));
      setSpeed(gaugeSpeed);
      if (!reducedMotion) {
        projectile.rotation.y += delta * 0.45;
        projectile.position.y = PHYSICS.launchHeight + Math.sin(now * 0.0015) * 0.025;
      }
      chaseCamera.follow(projectile.position, new THREE.Vector3(0, 0, -1), projectileRadius);
    }
    if (state === 'flying' && result) {
      flightElapsed += delta;
      const t = flightTimeAt(flightElapsed, playbackSpeed, result.impact.time);
      const sample = sampleTrajectory(result, t);
      if (result.breakup && !projectileIsFragmented && t >= result.breakup.time) {
        disposeProjectile();
        projectile = createAirborneFragments(result.vegetable, result.breakup);
        projectile.userData.ownsMaterials = true;
        projectileIsFragmented = true;
        world.scene.add(projectile);
        projectileRadius = new THREE.Box3().setFromObject(projectile).getBoundingSphere(new THREE.Sphere()).radius;
        $('control-hint').textContent = '空中で崩壊 · 仮定した強度による結果';
      }
      projectile.position.set(sample.position.x, sample.position.y, sample.position.z);
      projectile.rotation.x = t * 5;
      projectile.rotation.z = t * 3;
      chaseCamera.follow(projectile.position, new THREE.Vector3(sample.velocity.x, sample.velocity.y, sample.velocity.z), projectileRadius);
      trailPoints.push(projectile.position.clone());
      if (trailPoints.length > 180) trailPoints.shift();
      effects.setTrail(trailPoints);
      if (t >= result.impact.time) {
        beginImpact();
        aftermathDelta = Math.max(0, flightElapsed - result.impact.time / playbackSpeed);
      }
    }
    if (state === 'impact') {
      aftermathElapsed += aftermathDelta;
      if (aftermathElapsed >= 0.6) revealResult();
    }
    const visualDelta = aftermathDelta * (isReplay && (state === 'impact' || state === 'result') ? playbackSpeed : 1);
    effects.update(visualDelta);
    world.update(visualDelta);
    if ((state === 'impact' || state === 'result') && damage?.target === 'breached') {
      const remnants = effects.getFollowTarget();
      if (remnants) {
        chaseCamera.followAftermath(remnants.position, remnants.velocity, remnants.radius, remnants.landed);
        const hint = remnants.landed ? '破片が静止 · 街を俯瞰して確認' : '的の奥へ進む破片を追跡中';
        if ($('control-hint').textContent !== hint) $('control-hint').textContent = hint;
      }
    }
    chaseCamera.update(Math.min(delta, 0.05));
    cityView.update(experimentTime);
    const arrival = cityView.arrivals[0];
    if (!waveHeard && arrival != null && experimentTime >= arrival) {
      waveHeard = true;
      waveSound();
    }
    if (result && state === 'result') updateCityReport();
    if (overview) {
      world.camera.far = 300;
      world.camera.updateProjectionMatrix();
      const portrait = world.camera.aspect < 0.9;
      world.camera.position.set(portrait ? 29 : 23, portrait ? 40 : 28, portrait ? 30 : 19);
      world.camera.lookAt(0, 0, -18);
    }
    world.render();
  }
  animationId = requestAnimationFrame(frame);
}


function updateCityReport() {
  if (!result) return;
  const summary = cityExperiment.summary;
  const supersonic = result.launchMach > 1;
  const summaryText = `窓の破損 ${summary.brokenGlass}枚（直撃・仮定）${result.breakup ? ' · 空中崩壊（仮定）' : ''}`;
  if ($('city-summary').textContent !== summaryText) $('city-summary').textContent = summaryText;
  if (!cityDialog.open) return;
  const reportKey = `${shotNumber}-${isReplay}-${summary.contacted}-${summary.brokenGlass}`;
  if (lastCityReport === reportKey) return;
  lastCityReport = reportKey;
  const budget = flightEnergyBudget(result);
  const angle = machAngle(result.launchMach);
  const flow = airFlow(result.launchSpeedKmh / 3.6);
  const pulse = impactPulse(result.impact.energyJ, result.impact.contactPoint, result.impact.time, result.vegetable.radiusM, shotAcousticEfficiency);
  const fixedShape = result.breakup ? simulateThrow({ vegetableId: result.vegetable.id, speedKmh: result.launchSpeedKmh, angleDeg: shotAngleDeg }) : null;
  const comparison = fixedShape ? `<p class="model-comparison">衝突エネルギー<br>形状維持 ${number(fixedShape.impact.energyJ / 1000, 1)} kJ → 崩壊 ${number(result.impact.energyJ / 1000, 1)} kJ</p>` : '';
  const breakupText = result.breakup ? `${number(result.breakup.time * 1000, 1)} ms / ${number(-result.breakup.position.z, 1)} m` : shotBreakupEnabled ? 'この仮定では発生せず' : '形状維持で比較';
  $('city-report').innerHTML = `${comparison}<dl class="city-metrics"><div><dt>超音速の波</dt><dd>${supersonic ? `あり · M ${result.launchMach.toFixed(2)}` : 'なし'}</dd></div><div><dt>初速のマッハ角（模式）</dt><dd>${angle === null ? '—' : `${number(angle * 180 / Math.PI, 1)}°`}</dd></div><div><dt>先端よどみ点の圧力差</dt><dd>${number(flow.stagnationGaugePa / 1000, 1)} kPa</dd></div><div><dt>先端の空気温度</dt><dd>${number(flow.stagnationAirTemperatureK - 273.15, 1)} °C</dd></div><div><dt>空中崩壊（仮定）</dt><dd>${breakupText}</dd></div><div><dt>初期エネルギー</dt><dd>${number(budget.initialJ / 1000, 2)} kJ</dd></div><div><dt>飛行中の抵抗仕事</dt><dd>${number(budget.dragWorkJ / 1000, 2)} kJ</dd></div><div><dt>直撃した面</dt><dd>${summary.contacted}面</dd></div><div><dt>窓の破損（仮定）</dt><dd>${summary.brokenGlass}枚</dd></div></dl><h3>波の初回到達（近似）</h3><dl class="city-metrics">${CITY_OBSERVERS.map((o, i) => `<div><dt>${o.name}</dt><dd>${cityView.arrivals[i] == null ? '—' : `${number(cityView.arrivals[i]! * 1000, 1)} ms`}</dd></div>`).join('')}</dl><h3>衝突音の最大圧力（仮定）</h3><dl class="city-metrics">${CITY_OBSERVERS.map(o => { const pressure = pressureAt(pulse, o.position, 0); return `<div><dt>${o.name}</dt><dd>${pressure ? `${number(pressure.peakPa, 1)} Pa` : '近すぎるため適用外'}</dd></div>`; }).join('')}</dl><p class="dialog-note">音への変換率 ${number(shotAcousticEfficiency * 100, 2)}%・幅1ms・反射なし。実測値ではありません。先端の空気温度は野菜の温度ではありません。</p>`;
}
/** Quiet illustrative playback at the pavement observer, not a calibrated SPL. */
function waveSound() {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const length = Math.floor(audio.sampleRate * 0.045);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.14));
    const source = audio.createBufferSource(); source.buffer = buffer;
    const gain = audio.createGain(); gain.gain.value = 0.065;
    source.connect(gain).connect(audio.destination); source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  } catch { /* Audio is optional and does not drive physics. */ }
}
$('view-button').addEventListener('click', () => {
  overview = !overview;
  $('view-button').setAttribute('aria-pressed', String(overview));
  $('view-button').textContent = overview ? '野菜を追尾' : '街を俯瞰';
  if (!overview && result && state === 'result') chaseCamera.impact(new THREE.Vector3(result.impact.contactPoint.x, result.impact.contactPoint.y, result.impact.contactPoint.z), result.impact.kind === 'target', damage?.severity ?? 0);
});
$('waves-button').addEventListener('click', () => {
  wavesVisible = !wavesVisible;
  cityView?.setWaves(wavesVisible);
  $('waves-button').setAttribute('aria-pressed', String(wavesVisible));
  $('waves-button').textContent = `波 ${wavesVisible ? 'ON' : 'OFF'}`;
  $('wave-key').hidden = !wavesVisible;
});
$('city-report-button').addEventListener('click', () => { showDialog(cityDialog); updateCityReport(); });

function showDialog(dialog: HTMLDialogElement) { dialog.showModal(); }
$('settings-button').addEventListener('click', () => showDialog(settingsDialog));
const updateTheoryPanel = mountTheoryPanel(modelDialog, () => VEGETABLES.find(v => v.id === selectedId)!);
$('model-button').addEventListener('click', () => { updateTheoryPanel(); showDialog(modelDialog); });
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => button.addEventListener('click', () => $<HTMLDialogElement>(button.dataset.close!).close()));
[settingsDialog, modelDialog, cityDialog].forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }
}));
$('strength').addEventListener('input', event => { strengthPa = Number((event.target as HTMLInputElement).value) * 1000; $('strength-output').textContent = `${strengthPa / 1000} kPa`; });
$('acoustic-share').addEventListener('change', event => { acousticEfficiency = Number((event.target as HTMLSelectElement).value); });
$('angle').addEventListener('input', event => { angleDeg = Number((event.target as HTMLInputElement).value); $('angle-output').textContent = `${angleDeg}°`; });
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button => button.addEventListener('click', () => { $<HTMLInputElement>('exact-speed').value = button.dataset.preset!; }));
$('experiment-form').addEventListener('submit', event => { event.preventDefault(); const input = $<HTMLInputElement>('exact-speed'); if (input.checkValidity() && state !== 'loading' && state !== 'flying') launch(Number(input.value)); });
$('vegetable-list').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vegetable]');
  if (!button || state === 'flying' || state === 'impact' || state === 'loading') return;
  selectedId = button.dataset.vegetable!;
  const vegetable = VEGETABLES.find(v => v.id === selectedId)!;
  $('mass').textContent = vegetable.massKg >= 1 ? `${vegetable.massKg} kg` : `${Math.round(vegetable.massKg * 1000)} g`;
  document.querySelectorAll<HTMLButtonElement>('[data-vegetable]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
  ready();
});
throwButton.addEventListener('click', () => { if (state === 'result') ready(); else launch(gaugeSpeed); });
$('replay-button').addEventListener('click', () => launch(result?.launchSpeedKmh ?? 0, true));
$('sound-button').addEventListener('click', () => {
  sound = !sound;
  $('sound-button').textContent = `音 ${sound ? 'ON' : 'OFF'}`;
  $('sound-button').setAttribute('aria-pressed', String(sound));
  $('sound-button').setAttribute('aria-label', `音を${sound ? 'オフ' : 'オン'}にする`);
  if (sound) tone('launch');
});
window.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (event.code === 'Space' && !event.repeat && !settingsDialog.open && !modelDialog.open && !cityDialog.open && !['INPUT', 'BUTTON', 'A', 'TEXTAREA'].includes(target.tagName)) { event.preventDefault(); throwButton.click(); }
});
document.addEventListener('visibilitychange', () => { hidden = document.hidden; lastFrame = performance.now(); });
sceneContainer.addEventListener('rendercontextlost', () => { hidden = true; $('scene-message').hidden = false; $('scene-message').textContent = '3D表示を復元中…'; });
sceneContainer.addEventListener('rendercontextrestored', () => { hidden = document.hidden; lastFrame = performance.now(); $('scene-message').hidden = true; });

async function boot() {
  try {
    world = createWorld(sceneContainer);
    chaseCamera = createChaseCamera(world.camera, reducedMotion);
    world.render();
    cityView = createCityView(world.scene, cityExperiment);
    effects = await createEffects(world.scene, cityExperiment);
    ready();
    $('scene-message').hidden = true;
    new ResizeObserver(() => world.resize()).observe(sceneContainer);
    lastFrame = performance.now();
    animationId = requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    $('scene-message').innerHTML = '3D表示を開始できませんでした。<br><button class="text-button" onclick="location.reload()">再読み込み ↻</button>';
    throwButton.querySelector('span')!.textContent = '3D表示エラー';
  }
}
void boot();
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(animationId); disposeProjectile(); effects?.dispose(); cityView?.dispose(); world?.dispose(); void audio?.close(); });
