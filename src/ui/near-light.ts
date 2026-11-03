import { VEGETABLES } from '../simulation/physics';
import { NEAR_LIGHT_DURATION, NEAR_LIGHT_PRESETS, nearLightShot, type NearLightMedium } from '../simulation/near-light';
import { createNearLightView } from '../render/near-light';
import type { WorldView } from '../render/world';

export function mountNearLightLab(world: WorldView, reducedMotion: boolean, onExit: () => void) {
  const view = createNearLightView(world);
  const panel = document.createElement('section');
  panel.id = 'near-light-lab';
  panel.hidden = true;
  panel.setAttribute('aria-label', '近光速実験');
  panel.innerHTML = `
    <div class="light-heading"><div><span class="light-kicker">RELATIVITY LAB</span><h2>光速の、その手前。</h2></div><button id="light-exit">通常へ戻る</button></div>
    <div class="light-caption"><strong id="light-phase" role="status">発射前</strong><span id="light-caveat">大気との相互作用は仮説の映像</span></div>
    <div class="light-dock">
      <div class="light-config">
        <label for="light-vegetable">野菜<select id="light-vegetable">${VEGETABLES.map(v => `<option value="${v.id}">${v.name} · ${v.massKg * 1000} g</option>`).join('')}</select></label>
        <div class="light-speeds" role="group" aria-label="光速に対する速度">${NEAR_LIGHT_PRESETS.map(beta => `<button data-beta="${beta}" aria-pressed="${beta === 0.99}">${Number((beta * 100).toFixed(1))}%</button>`).join('')}</div>
        <div class="light-medium" role="group" aria-label="近光速の比較条件"><button data-medium="air" aria-pressed="true">大気 · 仮説</button><button data-medium="vacuum" aria-pressed="false">真空 · 等速</button></div>
      </div>
      <div class="light-metrics"><div><span>初期エネルギー · 理論値</span><strong id="light-energy"></strong></div><div><span>真空で12 m · 理論値</span><strong id="light-time"></strong></div></div>
      <div class="light-playback"><button id="light-launch">発射</button><button id="light-pause" disabled>Ⅱ 停止</button><button id="light-step" disabled>1コマ</button><input id="light-timeline" aria-label="映像の位置" type="range" min="0" max="6" step="0.02" value="0" disabled></div>
      <p id="light-note">時間・発光の広がりは演出。街への被害は未計算。</p>
      <details class="light-evidence"><summary>計算の範囲</summary><p>初速は地上基準。K = (γ − 1)mc²。100%は到達不能です。<br>真空は12mの等速移動のみで、衝突は計算しません。形状は地上で同時刻に測った長さの模式図で、光の到達遅れを含む見え方ではありません。<br>大気中の軌道・崩壊位置・温度・放射線量・放出エネルギー・建物被害は未計算。街を残しているのは「無傷」という予測ではありません。</p><a href="https://newt.phys.unsw.edu.au/einsteinlight/jw/module5_equations.htm" target="_blank" rel="noopener noreferrer">UNSW · 相対論の式 ↗</a><a href="https://e-publishing.cern.ch/index.php/CYRSP/article/view/714" target="_blank" rel="noopener noreferrer">CERN · 粒子と物質の相互作用 ↗</a></details>
    </div>`;
  document.querySelector('main')!.append(panel);
  const element = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  let active = false, launched = false, paused = false;
  let elapsed = 0;
  let beta = 0.99;
  let medium: NearLightMedium = 'air';
  let selected = VEGETABLES[0];
  let shot = nearLightShot(selected.massKg, beta);
  let lastPhase = '';

  function refreshValues() {
    shot = nearLightShot(selected.massKg, beta);
    const [coefficient, exponent] = shot.kineticEnergyJ.toExponential(2).split('e');
    element('light-energy').innerHTML = `${coefficient} × 10<sup>${Number(exponent)}</sup> <small>J</small>`;
    element('light-time').innerHTML = `${(shot.vacuumTransitSeconds! * 1e9).toFixed(2)} <small>ns</small>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-beta]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.beta) === beta)));
    panel.querySelectorAll<HTMLButtonElement>('[data-medium]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.medium === medium)));
    element('light-caveat').textContent = medium === 'air' ? '大気との相互作用は仮説の映像' : '真空・等速の比較 / 大幅なスロー表示';
    element('light-note').textContent = medium === 'air' ? '時間・発光の広がりは演出。街への被害は未計算。' : '12 mまでを約3秒で再生。衝突・被害は計算しません。';
  }
  function reset() {
    elapsed = 0; launched = false; paused = false; lastPhase = '';
    element<HTMLButtonElement>('light-pause').disabled = true;
    element<HTMLButtonElement>('light-step').disabled = true;
    element<HTMLInputElement>('light-timeline').disabled = true;
    element<HTMLInputElement>('light-timeline').value = '0';
    element('light-launch').textContent = '発射';
    element('light-pause').textContent = 'Ⅱ 停止';
    view.show(selected.id); refreshValues();
  }
  function play() {
    launched = true; paused = false; elapsed = 0;
    element<HTMLButtonElement>('light-pause').disabled = false;
    element<HTMLButtonElement>('light-step').disabled = false;
    element<HTMLInputElement>('light-timeline').disabled = false;
    element('light-pause').textContent = 'Ⅱ 停止';
    element('light-launch').textContent = '↻ 再発射';
  }
  function setPaused(value: boolean) { paused = value; element('light-pause').textContent = paused ? '▶ 再生' : 'Ⅱ 停止'; }
  element('light-launch').addEventListener('click', play);
  element('light-pause').addEventListener('click', () => { if (elapsed >= NEAR_LIGHT_DURATION) elapsed = 0; setPaused(!paused); });
  element('light-step').addEventListener('click', () => { setPaused(true); elapsed = Math.min(NEAR_LIGHT_DURATION, elapsed + 0.08); });
  element('light-timeline').addEventListener('input', event => { elapsed = Number((event.target as HTMLInputElement).value); setPaused(true); });
  element('light-vegetable').addEventListener('change', event => {
    selected = VEGETABLES.find(v => v.id === (event.target as HTMLSelectElement).value)!; reset();
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-beta]').forEach(button => button.addEventListener('click', () => { beta = Number(button.dataset.beta); reset(); }));
  panel.querySelectorAll<HTMLButtonElement>('[data-medium]').forEach(button => button.addEventListener('click', () => { medium = button.dataset.medium as NearLightMedium; reset(); }));
  function exit() {
    active = false; panel.hidden = true; view.hide();
    document.body.classList.remove('near-light-mode'); onExit();
    document.getElementById('near-light-button')?.focus();
  }
  element('light-exit').addEventListener('click', exit);
  const keydown = (event: KeyboardEvent) => {
    if (!active) return;
    if (event.code === 'Escape') { event.preventDefault(); exit(); }
    if (event.code === 'Space' && !event.repeat && !['INPUT', 'BUTTON', 'SELECT', 'A', 'SUMMARY'].includes((event.target as HTMLElement).tagName)) {
      event.preventDefault(); if (!launched) play(); else setPaused(!paused);
    }
  };
  window.addEventListener('keydown', keydown);
  return {
    get active() { return active; },
    open(id: string) {
      active = true; panel.hidden = false; document.body.classList.add('near-light-mode');
      selected = VEGETABLES.find(v => v.id === id)!;
      element<HTMLSelectElement>('light-vegetable').value = id; reset();
      element('light-launch').focus();
    },
    update(delta: number) {
      if (launched && !paused) elapsed = Math.min(NEAR_LIGHT_DURATION, elapsed + Math.max(0, delta));
      const frame = view.update(elapsed, medium, shot, launched, reducedMotion);
      if (frame.complete && !paused) setPaused(true);
      element<HTMLInputElement>('light-timeline').value = String(elapsed);
      const phase = !launched ? `光速の${Number((beta * 100).toFixed(1))}%で発射` : medium === 'air'
        ? frame.complete ? '街への被害：未計算' : '発光・拡散のイメージ'
        : `真空の経過 ${(frame.vacuumTimeSeconds! * 1e9).toFixed(2)} ns`;
      if (phase !== lastPhase) { element('light-phase').textContent = phase; lastPhase = phase; }
    },
    dispose() { window.removeEventListener('keydown', keydown); view.dispose(); panel.remove(); },
  };
}
