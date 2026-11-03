import { LIGHT_SPEED_MS, relativisticMotion } from '../simulation/relativity';

/** Deliberately isolated from the atmospheric throw simulation. */
export function mountTheoryPanel(dialog: HTMLDialogElement, specimen: () => { name: string; massKg: number }) {
  const section = document.createElement('section');
  section.className = 'theory-panel';
  section.innerHTML = `<p class="research-status">研究中：貫通・街の被害は未確定。</p>
    <details><summary>光速に近づける · 理論値</summary>
      <p class="theory-specimen"></p>
      <div class="theory-presets" role="group" aria-label="理論計算の速度">
        <button type="button" data-theory-speed="${2000 / 3.6}" aria-pressed="true">2,000 km/h</button>
        ${[10, 90, 99, 99.9].map(percent => `<button type="button" data-theory-speed="${percent / 100 * LIGHT_SPEED_MS}" aria-pressed="false">光速の${percent}%</button>`).join('')}
      </div>
      <div class="theory-results" aria-live="polite" aria-atomic="true"></div>
      <p>地上基準・発射直後の値。<br>空気中の崩壊・放射・被害は未計算。</p>
      <p>質量のある野菜は、光速100%に到達できません。</p>
      <a class="source-link" href="https://newt.phys.unsw.edu.au/einsteinlight/jw/module5_equations.htm" target="_blank" rel="noopener noreferrer">UNSW · 相対論の式 ↗</a>
    </details>
    <a class="source-link" href="https://github.com/cadmium2525/throw_vegetable/blob/main/docs/evidence-review.md" target="_blank" rel="noopener noreferrer">調査結果・実装の根拠 ↗</a>`;
  dialog.querySelector('.dialog-heading')!.after(section);
  let speed = 2000 / 3.6;
  const scientific = (value: number) => {
    if (value < 1000) return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const exponent = Math.floor(Math.log10(value));
    return `${(value / 10 ** exponent).toFixed(3)} × 10<sup>${exponent}</sup>`;
  };
  function update() {
    const vegetable = specimen();
    const result = relativisticMotion(vegetable.massKg, speed);
    const seconds = result.vacuumTransitSeconds!;
    const time = seconds >= 0.001 ? `${(seconds * 1000).toFixed(2)} ms` : `${(seconds * 1e9).toFixed(2)} ns`;
    section.querySelector('.theory-specimen')!.textContent = `${vegetable.name} · ${vegetable.massKg * 1000} g（仮定）`;
    section.querySelector('.theory-results')!.innerHTML = `<dl>
      <div><dt>初期運動エネルギー</dt><dd>${scientific(result.kineticEnergyJ)} J</dd></div>
      <div><dt>初期運動量</dt><dd>${scientific(result.momentumKgMs)} kg·m/s</dd></div>
      <div><dt>12mの時間（真空・等速）</dt><dd>${time}</dd></div>
    </dl>`;
    section.querySelectorAll<HTMLButtonElement>('[data-theory-speed]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.theorySpeed) === speed));
    });
  }
  section.querySelectorAll<HTMLButtonElement>('[data-theory-speed]').forEach(button => {
    button.addEventListener('click', () => { speed = Number(button.dataset.theorySpeed); update(); });
  });
  update();
  return update;
}
