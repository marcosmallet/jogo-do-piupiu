# Travessia do Canarinho

Jogo arcade em HTML5/Canvas inspirado em travessias de trânsito, feito para rodar no navegador em computador, celular, gamepad e TV. O mesmo jogo também é empacotado em um aplicativo Android TV/Google TV que funciona offline.

## Estrutura

- `index.html`: jogo web completo, sem dependências de runtime ou backend.
- `android-tv/`: wrapper nativo Android TV em Kotlin, usando WebView protegida e conteúdo local.
- `tests/`: testes de regressão do jogo com Playwright.
- `.github/workflows/ci.yml`: validação automática web e Android a cada alteração.

O runtime web permanece deliberadamente em um único `index.html`: isso mantém o APK totalmente autocontido, reduz falhas de carregamento em navegadores de TV e preserva a possibilidade de publicar o jogo como um único arquivo estático. Internamente, o JavaScript continua dividido por responsabilidades em classes de jogo, renderização, entrada, áudio, pistas, partículas e desempenho.

## Rodar no navegador

Sirva a raiz por qualquer servidor HTTP estático. Por exemplo:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

Controles:

- teclado: `↑`/`↓` ou `W`/`S`;
- Enter: iniciar, confirmar e continuar;
- Esc/Backspace: pausar/voltar;
- touch: botões na tela;
- gamepad/TV: direcional, botão principal, voltar e Start.

## Modo de diagnóstico

Abra o jogo com `?debug=1`. Durante desenvolvimento também é possível reduzir a duração da partida, por exemplo `?debug=1&duration=5`.

O modo de diagnóstico expõe `window.__gameTest` para automação e mostra FPS, estado, quantidade de veículos, renderizações, áudio e outras informações de runtime.

## Testes web

Requer Node.js 20 ou superior.

```bash
npm install
npx playwright install chromium
npm run test:web
```

Os testes cobrem inicialização offline, pausa/retomada, persistência imediata do recorde, colisão/invulnerabilidade e a economia de renderização nas telas estáticas.

## Android TV

O aplicativo exige Android TV/Google TV 10 (API 29) ou superior. Consulte `android-tv/README.md` para preparação do SDK, build, instalação via ADB e homologação em TV física.

Build de homologação no Windows:

```powershell
cd android-tv
.\tools\Build-Debug.ps1 -Clean
```

Build de release não assinado:

```powershell
.\tools\Build-Release.ps1 -Clean
```

O APK de release precisa ser assinado com uma chave privada antes de distribuição pública.

## Segurança e funcionamento offline

O APK não solicita permissão `INTERNET`. A WebView bloqueia carregamentos de rede, acesso arbitrário a arquivos e navegação externa; o jogo é copiado da raiz para os assets durante o build. O conteúdo funciona sem backend e sem recursos externos em runtime.

## CI

O GitHub Actions executa:

- testes Playwright em Chromium;
- testes unitários Android;
- Android Lint em debug e release;
- geração dos APKs debug e release não assinado.

## Licença

Código e assets com todos os direitos reservados. Consulte `LICENSE`.
