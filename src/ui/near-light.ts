import { VEGETABLES } from '../simulation/physics';
import { NEAR_LIGHT_DURATION, NEAR_LIGHT_PRESETS, nearLightShot, type NearLightMedium } from '../simulation/near-light';
import { createNearLightView } from '../render/near-light';
import type { WorldView } from '../render/world';
import { readSandboxRecords, SANDBOX_STORAGE_KEY, type SandboxRecord } from '../simulation/demolition';
import { mountPlanetScale } from './planet-scale';

export function mountNearLightLab(world: WorldView, reducedMotion: boolean, onExit: () => void) {
  const view = createNearLightView(world);
  const panel = document.createElement('section');
  panel.id = 'near-light-lab';
  panel.hidden = true;
  panel.setAttribute('aria-label', '近光速実験');
  panel.innerHTML = `
    <div class="light-heading"><div><span class="light-kicker">RELATIVITY LAB</span><h2>光速の、その手前。</h2></div><button id="light-exit">通常へ戻る</button></div>
    <div class="light-explore"><button id="light-book" class="light-book">実験帳 0 / 18</button><button id="light-planet" class="light-book">地球と比較</button><button id="light-city-view" class="light-book" aria-pressed="false">街全体</button></div>
    <div class="light-caption"><strong id="light-phase" role="status">発射前</strong><span id="light-damage" hidden></span><span id="light-caveat">破壊はゲーム用の仮定</span><div class="light-result-actions" id="light-result-actions" hidden><button id="light-compare" aria-pressed="false">破壊前と比べる</button><button id="light-next">次の野菜 →</button></div></div>
    <div class="light-dock">
      <div class="light-config">
        <label for="light-vegetable">野菜<select id="light-vegetable">${VEGETABLES.map(v => `<option value="${v.id}">${v.name} · ${v.massKg * 1000} g</option>`).join('')}</select></label>
        <div class="light-speeds" role="group" aria-label="光速に対する速度">${NEAR_LIGHT_PRESETS.map(beta => `<button data-beta="${beta}" aria-pressed="${beta === 0.99}">${Number((beta * 100).toFixed(1))}%</button>`).join('')}</div>
        <div class="light-medium" role="group" aria-label="近光速の比較条件"><button data-medium="air" aria-pressed="true">大気 · 仮説</button><button data-medium="vacuum" aria-pressed="false">真空 · 等速</button></div>
      </div>
      <div class="light-metrics"><div><span>初期エネルギー · 理論値</span><strong id="light-energy"></strong></div><div><span>真空で12 m · 理論値</span><strong id="light-time"></strong></div></div>
      <div class="light-playback"><button id="light-launch">発射</button><button id="light-pause" disabled>Ⅱ 停止</button><button id="light-step" disabled>1コマ</button><input id="light-timeline" aria-label="映像の位置" type="range" min="0" max="${NEAR_LIGHT_DURATION}" step="0.02" value="0" disabled></div>
      <p id="light-note">理論値＋破壊サンドボックス。実際の被害予測ではありません。</p>
      <details class="light-evidence"><summary>計算の範囲</summary><p>初速は地上基準。K = (γ − 1)mc²。100%は到達不能です。<br>真空は12mの等速移動のみで、衝突は計算しません。形状は地上で同時刻に測った長さの模式図で、光の到達遅れを含む見え方ではありません。<br>大気中の軌道・崩壊位置・温度・放射線量・放出エネルギー・現実の建物被害は未計算。破壊範囲は初期エネルギーの対数を街の表示範囲に圧縮したゲーム規則です。残った建物の安全を示しません。点数は倒壊100・窓10・設備25。時間・瓦礫・粉塵も演出です。</p><a href="https://newt.phys.unsw.edu.au/einsteinlight/jw/module5_equations.htm" target="_blank" rel="noopener noreferrer">UNSW · 相対論の式 ↗</a><a href="https://e-publishing.cern.ch/index.php/CYRSP/article/view/714" target="_blank" rel="noopener noreferrer">CERN · 粒子と物質の相互作用 ↗</a></details>
      <dialog id="light-record-dialog"><div class="dialog-heading"><h2>実験帳</h2><button id="light-book-close" class="close-button" aria-label="実験帳を閉じる">×</button></div><p id="light-personal-best"></p><div id="light-records"></div><p class="dialog-note">点数はゲーム内の破壊記録。現実の被害量ではありません。<br>この端末のブラウザーに保存します。</p></dialog>
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
  let before = false, recorded = false;
  let cityOverview = false;
  const planet = mountPlanetScale(panel, () => ({ name: selected.name, energyJ: shot.kineticEnergyJ, beta }));
  element('light-planet').addEventListener('click', () => planet.show());
  element('light-city-view').addEventListener('click', () => {
    cityOverview = !cityOverview;
    element('light-city-view').textContent = cityOverview ? '自動追尾' : '街全体';
    element('light-city-view').setAttribute('aria-pressed', String(cityOverview));
  });
  let records: SandboxRecord[] = [];
  try { records = readSandboxRecords(localStorage.getItem(SANDBOX_STORAGE_KEY)); } catch { /* Private/storage-restricted sessions still play. */ }
  const book = element<HTMLDialogElement>('light-record-dialog');
  function updateBook() {
    element('light-book').textContent = `実験帳 ${records.length} / 18`;
    element('light-personal-best').textContent = `最高 ${Math.max(0, ...records.map(r => r.score)).toLocaleString()} pts`;
    element('light-records').innerHTML = `<table><thead><tr><th>野菜</th>${NEAR_LIGHT_PRESETS.map(b => `<th>${Number((b * 100).toFixed(1))}%</th>`).join('')}</tr></thead><tbody>${VEGETABLES.map(v => `<tr><th>${v.name}</th>${NEAR_LIGHT_PRESETS.map(b => { const r = records.find(r => r.key === `${v.id}:${b}`); return `<td>${r ? r.score.toLocaleString() : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  updateBook();
  element('light-book').addEventListener('click', () => { updateBook(); book.showModal(); });
  element('light-book-close').addEventListener('click', () => book.close());
  element('light-compare').addEventListener('click', () => {
    before = !before;
    element('light-compare').textContent = before ? '破壊後を見る' : '破壊前と比べる';
    element('light-compare').setAttribute('aria-pressed', String(before));
  });
  element('light-next').addEventListener('click', () => {
    const next = VEGETABLES.find(v => !records.some(r => r.key === `${v.id}:${beta}`))
      ?? VEGETABLES[(VEGETABLES.indexOf(selected) + 1) % VEGETABLES.length];
    selected = next; element<HTMLSelectElement>('light-vegetable').value = selected.id; reset();
    element('light-launch').focus();
  });

  function refreshValues() {
    shot = nearLightShot(selected.massKg, beta);
    const [coefficient, exponent] = shot.kineticEnergyJ.toExponential(2).split('e');
    element('light-energy').innerHTML = `${coefficient} × 10<sup>${Number(exponent)}</sup> <small>J</small>`;
    element('light-time').innerHTML = `${(shot.vacuumTransitSeconds! * 1e9).toFixed(2)} <small>ns</small>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-beta]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.beta) === beta)));
    panel.querySelectorAll<HTMLButtonElement>('[data-medium]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.medium === medium)));
    element('light-caveat').textContent = medium === 'air' ? '破壊はゲーム用の仮定' : '真空・等速の比較 / 大幅なスロー表示';
    element('light-note').textContent = medium === 'air' ? '理論値＋破壊サンドボックス。実際の被害予測ではありません。' : '12 mまでを約3秒で再生。衝突・被害は計算しません。';
  }
  function reset() {
    elapsed = 0; launched = false; paused = false; lastPhase = '';
    before = false; recorded = false;
    element('light-result-actions').hidden = true;
    element('light-damage').hidden = true;
    element('light-compare').textContent = '破壊前と比べる';
    element('light-compare').setAttribute('aria-pressed', 'false');
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
    before = false; recorded = false;
    element('light-result-actions').hidden = true;
    element('light-compare').textContent = '破壊前と比べる';
    element('light-compare').setAttribute('aria-pressed', 'false');
    element<HTMLButtonElement>('light-pause').disabled = false;
    element<HTMLButtonElement>('light-step').disabled = false;
    element<HTMLInputElement>('light-timeline').disabled = false;
    element('light-pause').textContent = 'Ⅱ 停止';
    element('light-launch').textContent = '↻ 再発射';
  }
  function setPaused(value: boolean) { paused = value; element('light-pause').textContent = paused ? '▶ 再生' : 'Ⅱ 停止'; }
  element('light-launch').addEventListener('click', play);
  element('light-pause').addEventListener('click', () => { if (elapsed >= NEAR_LIGHT_DURATION) play(); else setPaused(!paused); });
  element('light-step').addEventListener('click', () => { setPaused(true); elapsed = Math.min(NEAR_LIGHT_DURATION, elapsed + 0.08); });
  element('light-timeline').addEventListener('input', event => {
    elapsed = Number((event.target as HTMLInputElement).value); setPaused(true); before = false;
    element('light-compare').textContent = '破壊前と比べる'; element('light-compare').setAttribute('aria-pressed', 'false');
  });
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
    if (!active || book.open || planet.open) return;
    if (event.code === 'Escape') { event.preventDefault(); exit(); }
    if (event.code === 'Space' && !event.repeat && !['INPUT', 'BUTTON', 'SELECT', 'A', 'SUMMARY'].includes((event.target as HTMLElement).tagName)) {
      event.preventDefault(); if (!launched || elapsed >= NEAR_LIGHT_DURATION) play(); else setPaused(!paused);
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
      if (launched && !paused && !book.open && !planet.open) elapsed = Math.min(NEAR_LIGHT_DURATION, elapsed + Math.max(0, delta));
      const frame = view.update(elapsed, medium, shot, launched, reducedMotion, before, cityOverview);
      if (frame.complete && !paused) setPaused(true);
      element<HTMLInputElement>('light-timeline').value = String(elapsed);
      element('light-result-actions').hidden = !launched || medium !== 'air' || !frame.complete;
      element('light-damage').hidden = !launched || medium !== 'air';
      if (launched && medium === 'air') {
        element('light-damage').textContent = `倒壊 ${frame.damage.buildings}棟 · 窓 ${frame.damage.windows}枚`;
        if (frame.complete && !recorded) {
          const key = `${selected.id}:${beta}`;
          records = records.filter(r => r.key !== key);
          records.push({ key, vegetableId: selected.id, beta, score: frame.damage.score, buildings: frame.damage.buildings, windows: frame.damage.windows });
          try { localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(records)); } catch { /* Records remain available in memory. */ }
          recorded = true; updateBook();
        }
      }
      const phase = !launched ? `光速の${Number((beta * 100).toFixed(1))}%で発射` : medium === 'air'
        ? before ? '破壊前の街' : frame.complete ? `${frame.damage.score.toLocaleString()} pts · 実験完了` : frame.damage.score > 0 ? `${frame.damage.score.toLocaleString()} pts · 連鎖中` : '発光 → 街へ'
        : `真空の経過 ${(frame.vacuumTimeSeconds! * 1e9).toFixed(2)} ns`;
      if (phase !== lastPhase) { element('light-phase').textContent = phase; lastPhase = phase; }
    },
    dispose() { window.removeEventListener('keydown', keydown); planet.dispose(); view.dispose(); panel.remove(); },
  };
}
