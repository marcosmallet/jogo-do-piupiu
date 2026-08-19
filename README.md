# Travessia do Canarinho

Jogo arcade em HTML5/Canvas feito para navegador, celular, gamepad e TV. A versão Android TV/Google TV empacota todo o runtime localmente e funciona offline.

## Estrutura

- `index.html`: núcleo do jogo, renderização Canvas, estados, trânsito, input e áudio base.
- `aaa.js`: carregador síncrono da camada premium e dos controles horizontais.
- `aaa-core.js`: camada premium original: combo, quase-acidentes, Adrenalina, Modo Pistola, fases, carreira local, feedback visual e trilha adaptativa procedural.
- `horizontal-controls.js`: movimento lateral do personagem em teclado, touch, gamepad e Android TV.
- `android-tv/`: wrapper nativo Android TV em Kotlin com WebView protegida e assets locais.
- `tests/`: regressão e sistemas premium com Playwright.
- `.github/workflows/ci.yml`: validação automática web e Android.

O runtime continua sem framework web, backend ou recursos externos. A separação mantém o núcleo estável e permite evoluir os sistemas premium e os controles de forma isolada; todos os arquivos necessários também são empacotados no APK.

## Jogabilidade

O objetivo continua sendo atravessar as dez pistas, mas agora o personagem pode se deslocar tanto verticalmente quanto lateralmente para procurar corredores e desviar do trânsito:

- travessias consecutivas constroem combo e concedem pequeno bônus de tempo;
- passar muito perto de um veículo gera um `QUASE!` e aumenta a Adrenalina;
- ao atingir 100% de Adrenalina, o `Modo Pistola` cria uma janela curta de vantagem;
- a pressão do trânsito sobe gradualmente durante a partida;
- a direção visual muda em `Aquecimento`, `Pressão Subindo` e `Reta Final`;
- a trilha procedural acompanha a partida, aumentando BPM e camadas conforme fase, combo e Modo Pistola;
- ao fim da corrida o jogador recebe classe C/B/A/S;
- corridas, melhor combo, melhor classe e quantidade de classes S persistem localmente.

Efeitos visuais e camadas de áudio são reduzidos automaticamente quando o gerenciador de desempenho detecta queda de FPS. O jogo também respeita preferência de movimento reduzido para os efeitos visuais.

## Rodar no navegador

Sirva a raiz por qualquer servidor HTTP estático. Por exemplo:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000`.

Controles:

- teclado: `↑`/`↓`/`←`/`→` ou `W`/`S`/`A`/`D`;
- Enter: iniciar, confirmar e continuar;
- Esc/Backspace: pausar/voltar;
- touch: quatro botões direcionais na tela;
- gamepad/TV: direcional ou analógico, botão principal, voltar e Start.

## Modo de diagnóstico

Abra o jogo com `?debug=1`. Também é possível reduzir a duração da partida, por exemplo `?debug=1&duration=5`.

O núcleo expõe `window.__gameTest`; a camada premium expõe `window.__aaaTest`; a trilha adaptativa expõe `window.__scoreTest`; e o movimento horizontal expõe `window.__horizontalControlsTest`. Esses hooks permitem validar regras e sincronização sem depender de interação manual.

## Testes web

Requer Node.js 20 ou superior.

```bash
npm install
npx playwright install chromium
npm run test:web
```

A suíte cobre, entre outros pontos, inicialização offline, pausa, recorde, colisão, renderização ociosa, movimento horizontal e limites laterais, combo, quase-acidente, Modo Pistola, progressão de carreira, fases da partida e sincronização da trilha adaptativa.

### Orçamento de performance

Os limites executados em CI são deliberadamente tolerantes e servem como **piso de regressão**, não como selo de qualidade gráfica. Há também um cenário determinístico de stress em 1080p com 30 veículos, emissão sustentada de partículas e Modo Pistola por pelo menos 5 segundos úteis. Ele registra p50/p95/p99 de frame time, long frames acima de 32/50 ms e degradação adaptativa.

A meta de experiência é **50–60 FPS em 720p/1080p em hardware razoável**, com redução graciosa de efeitos em TVs fracas antes de comprometer input, cronômetro ou fairness. GitHub-hosted runners não são tratados como benchmark de GPU; os thresholds de CI existem para detectar regressões severas e stutter anormal.

## Android TV

O aplicativo exige Android TV/Google TV 10 (API 29) ou superior. Consulte `android-tv/README.md` para SDK, build, instalação via ADB e homologação física.

Build de homologação no Windows:

```powershell
cd android-tv
.\tools\Build-Debug.ps1 -Clean
```

Build de release não assinado:

```powershell
.\tools\Build-Release.ps1 -Clean
```

A versão atual do aplicativo é `1.3.0` (`versionCode 4`). O APK de release precisa ser assinado com uma chave privada antes de distribuição pública.

## Segurança e funcionamento offline

O APK não solicita permissão `INTERNET`. A WebView bloqueia carregamentos de rede, acesso arbitrário a arquivos e navegação externa. `index.html`, `aaa.js`, `aaa-core.js` e `horizontal-controls.js` são copiados para os assets no build, portanto sistemas premium, controles horizontais e trilha procedural também funcionam offline.

## CI

O GitHub Actions executa:

- testes Playwright em Chromium;
- testes unitários Android;
- Android Lint em debug e release;
- geração dos APKs debug e release não assinado.

## Licença

Código e assets com todos os direitos reservados. Consulte `LICENSE`.
