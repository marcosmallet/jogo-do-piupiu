# Travessia do Canarinho para Android TV

Aplicativo nativo para Android TV e Google TV 10 (API 29) ou superior. O APK empacota `index.html` e `aaa.js` da raiz e funciona sem internet.

Versão atual do aplicativo: `1.3.0` (`versionCode 4`).

## Ambiente

- JDK 17
- Android SDK Platform 36
- Android SDK Build Tools 36.0.0
- Android SDK Platform Tools
- Gradle 9.5.0, por meio do Gradle Wrapper

## Gerar o APK de homologação

No PowerShell:

```powershell
cd C:\projetos\jogo-do-piupiu\android-tv
.\tools\Build-Debug.ps1 -Clean
```

Saída:

```text
android-tv\dist\travessia-canarinho-tv-debug.apk
```

## Gerar o APK de release

```powershell
.\tools\Build-Release.ps1 -Clean
```

Saída:

```text
android-tv\dist\travessia-canarinho-tv-release-unsigned.apk
```

O APK de release é gerado sem assinatura. Para distribuição pública, assine-o com uma chave privada e preserve essa chave de forma segura para as próximas versões.

Os arquivos web não são duplicados manualmente. A tarefa `syncGameAsset` copia `index.html` e `aaa.js` para `app\build\generated\game-assets` antes de cada compilação.

## Instalar na TV

Ative as opções do desenvolvedor e a depuração USB ou sem fio. Depois que a TV estiver visível em `adb devices`, execute:

```powershell
.\tools\Install-OnTv.ps1
```

Para mais de um dispositivo conectado:

```powershell
.\tools\Install-OnTv.ps1 -Serial "IP_DA_TV:5555"
```

O script consulta a versão do Android e bloqueia a instalação abaixo da API 29.

## Controles

- D-pad para cima/baixo: dificuldade ou movimento contínuo
- Enter, centro do D-pad ou botão A: confirmar
- Voltar ou botão B: pausar; pressionar novamente na pausa fecha o aplicativo
- Start: iniciar, pausar ou continuar

Eventos de mouse, touchpad, hover e toque são ignorados pelo WebView. O cursor nativo usa `PointerIcon.TYPE_NULL`.

## Camada premium

O APK inclui combo, quase-acidentes, Adrenalina, Modo Pistola, progressão de intensidade, fases visuais, carreira local e trilha procedural adaptativa. A música reage à fase, Adrenalina e combo, e para junto com a partida. Efeitos/camadas são reduzidos quando o jogo entra em modo de baixo desempenho.

## Segurança e conteúdo offline

A WebView carrega somente os assets locais pelo `WebViewAssetLoader`. O aplicativo bloqueia carregamentos de rede, desativa acesso arbitrário a arquivos/conteúdo e não declara a permissão `INTERNET`. O debugging do WebView fica habilitado apenas em builds de debug.

## Homologação física pendente

A ausência do cursor precisa ser confirmada na TV real, pois alguns fabricantes podem desenhar um ponteiro fora da camada controlada pelo aplicativo. Durante o teste, valide também áudio/trilha, D-pad mantido, pausa, reinício, efeitos premium, 720p/1080p/4K e `adb logcat`.

## Validação já executada no projeto

- Build com AGP 9.3.0 e Gradle 9.5.0: aprovado
- `testDebugUnitTest`: aprovado
- `lintDebug`: aprovado
- Android TV 10/API 29, emulador 1080p: instalação e execução aprovadas
- API 29: D-pad mantido move, `keyup` libera o movimento e Voltar pausa/fecha
- Android TV API 36, emulador 1080p: instalação, WebView e controles aprovados
- API 36: callback moderno de Voltar validado em `playing -> paused`
- Manifesto do APK: `minSdk=29`, `targetSdk=36`, Leanback e sem `INTERNET`

A CI da raiz executa testes web, testes unitários Android, Android Lint e builds debug/release em cada alteração. Isso complementa, mas não substitui a homologação visual e de áudio em TV física.
