# やさい投擲実験所

Three.jsで野菜を投げる、無料のブラウザーゲーム。

[ゲームを開く](https://cadmium2525.github.io/throw_vegetable/)

## 起動

Node.js 22.12以上を用意して実行します。

```sh
npm ci
npm run dev
```

表示されたURLを開きます。ゲージに合わせて「投げる」をタップ。設定から0〜2000 km/hを直接指定できます。スペースキーにも対応。

## GitHub Pages

1. このフォルダーの内容を公開リポジトリの `main` にpush。
2. リポジトリの **Settings → Pages → Source → GitHub Actions** を選択。
3. **Actions → Deploy to GitHub Pages** が成功すると公開されます。設定前の初回実行が失敗した場合は再実行してください。

`.github/workflows/pages.yml` を設定済み。相対パスなのでリポジトリ名によらず動きます。公開リポジトリと標準のGitHub Actionsランナーを利用すれば、GitHub Freeでホスティングできます。[GitHubの説明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

有料API・サーバー・画像素材は不要。野菜、背景、音はコードで生成しています。

## 物理の範囲

重力、Mach依存の空気抵抗、連続衝突判定を計算。野菜は一定形状の剛体で、抵抗係数は仮定値です。**実物の破砕・変形・貫通を予測する実験シミュレーターではありません。** 破片や衝撃波の表示は演出です。

式・仮定・出典は [docs/physics.md](docs/physics.md)。

## 検証

```sh
npm test
npm run build
npm run preview
```

本番用ファイルは `dist/` に出力されます。スマートフォン・PC対応。初回読み込みにはWebGLとWebAssemblyが利用できるブラウザーが必要です。破片用WASMを読み込めない場合は軽量演出に切り替わります。
