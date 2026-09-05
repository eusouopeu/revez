# Instruções para o Claude neste projeto

## Toda mudança de código deve terminar em commit + push + APK

Sempre que você alterar qualquer arquivo de código deste app (`src/`,
configs como `vite.config.ts`, `capacitor.config.ts`, etc.), ao final da
tarefa — sem que o usuário precise pedir de novo:

1. **Commit e push** das mudanças para `origin/main`.
2. **Gerar o APK atualizado** (debug) e entregar o arquivo ao usuário.

Isso vale para qualquer edição de código, não só quando o usuário disser
explicitamente "faça o commit" ou "gere o apk".

Não se aplica a mudanças que não sejam de código do app (ex.: só conversa,
só leitura, só este próprio arquivo `CLAUDE.md`).

### Como gerar o APK

```bash
npm run build
npx cap sync android
```

O Gradle deste projeto (Capacitor 8) exige **JDK 21** para compilar, mas o
`java_home` padrão do sistema aponta para o JDK 17. Há um JDK 21 instalado
via Homebrew (`openjdk@21`) — aponte `JAVA_HOME` para ele antes de rodar o
Gradle:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
cd android && ./gradlew assembleDebug
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`. Envie
esse arquivo ao usuário com a ferramenta de envio de arquivo.

Builds de `./gradlew` tendem a ser redirecionados para rodar em sandbox
(context-mode) em vez do Bash direto — nesse caso, rode o comando via essa
ferramenta mesmo, passando `cwd` para o diretório do projeto; ela roda no
mesmo filesystem da máquina real.
