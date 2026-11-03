import { CHICXULUB_REFERENCE_J, EARTH_BINDING_J, planetScale } from '../simulation/planet-scale';

export function mountPlanetScale(parent: HTMLElement, specimen: () => { name: string; energyJ: number; beta: number }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'planet-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><h2>地球規模？</h2><button class="close-button" aria-label="地球との比較を閉じる">×</button></div>
    <p class="planet-verdict">今の設定で、地球は砕けません。</p><p class="planet-specimen"></p>
    <div class="planet-energy-chart" aria-label="エネルギーの桁を比較"></div>
    <p class="planet-ratio"></p><p>地球全体の環境への影響は未計算。<br>エネルギーの比は、被害面積の比ではありません。</p>
    <details><summary>比較の根拠</summary><p>質量のある野菜は光速100%には到達できません。現在の上限は99.9%。初期運動エネルギーのみを比較し、全量が地面に伝わるとは仮定しません。</p><p>巨大隕石はチクシュルーブ衝突の推定値の一例。地球をばらばらにする目安は一様球の重力結合エネルギー 3GM²/(5R)。実際の地球の内部構造は一様ではなく、環境破壊のしきい値でもありません。</p>
    <a class="source-link" href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html" target="_blank" rel="noopener noreferrer">NASA · 地球の質量・半径 ↗</a><a class="source-link" href="https://www.lpi.usra.edu/science/kring/Chicxulub/discovery/" target="_blank" rel="noopener noreferrer">LPI · チクシュルーブ衝突 ↗</a></details>`;
  parent.append(dialog);
  dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
  const scientific = (value: number) => { const [m, e] = value.toExponential(2).split('e'); return `${m} × 10<sup>${Number(e)}</sup> J`; };
  return {
    get open() { return dialog.open; },
    show() {
      const { name, energyJ, beta } = specimen();
      const comparison = planetScale(energyJ);
      dialog.querySelector('.planet-specimen')!.textContent = `${name} · 光速の${Number((beta * 100).toFixed(1))}%`;
      const rows = [[`${name}の初期エネルギー`, energyJ], ['巨大隕石の参考値', CHICXULUB_REFERENCE_J], ['地球をばらばらにする目安', EARTH_BINDING_J]] as const;
      dialog.querySelector('.planet-energy-chart')!.innerHTML = rows.map(([label, energy]) => `<div><span>${label}</span><strong>${scientific(energy)}</strong><div class="planet-track"><i style="width:${Math.max(0, Math.min(100, (Math.log10(Math.max(energy, 1)) - 14) / 19 * 100))}%"></i></div></div>`).join('') + '<small>対数表示：棒の長さはエネルギーの桁</small>';
      const deficit = 1 / comparison.earthBindingFraction;
      dialog.querySelector('.planet-ratio')!.textContent = `地球をばらばらにする目安の約${(deficit / 1e12).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}兆分の1。`;
      dialog.showModal();
    },
    dispose() { dialog.remove(); },
  };
}
