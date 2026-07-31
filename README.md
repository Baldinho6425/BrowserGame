# 🏎️ Corrida Turbo

Jogo de corrida endless top-down, feito em HTML5 Canvas + JavaScript puro — sem build step, sem dependências externas.

## Como jogar

Basta abrir [`index.html`](index.html) direto no navegador (duplo clique ou arrastar para o Chrome/Edge/Firefox).

Se preferir servir por `localhost` (por exemplo para testar em outro dispositivo na mesma rede), suba qualquer servidor estático na pasta do projeto, por exemplo:

```bash
npx serve .
# ou
python -m http.server 8000
```

## Controles

| Ação | Teclado | Toque |
|---|---|---|
| Mover | `←` `→` ou `A` `D` | Botões laterais |
| Acelerar / frear | `↑` `↓` ou `W` `S` | Botões ▲ / ▼ |
| Nitro | `Shift` | Botão 🔥 |
| Pausar | `P` | — |
| Confirmar (início / reiniciar) | `Enter` | Toque no botão |

## Funcionalidades

- **Garagem de carros** — 5 carros com atributos próprios (velocidade, manobra, nitro), desbloqueáveis com moedas coletadas em corrida.
- **Cenários** — Cidade (chuva), Deserto e Nevado (neve), cada um com cenografia e clima próprios, também desbloqueáveis.
- **Ciclo dia/noite** — iluminação, postes de luz e faróis dos carros reagem à passagem do tempo dentro da corrida.
- **Nitro** — impulso de velocidade com medidor próprio, recarga passiva e rastro de partículas.
- **Obstáculos variados** — tráfego e cones (letais) e poças de óleo (não letais, causam derrapagem temporária).
- **Combo de "quase colisão"** — pontos bônus por desviar por pouco de obstáculos.
- **Desafio diário** — corrida com semente fixa por dia (mesmos obstáculos para todo mundo), com melhor pontuação do dia separada do ranking normal.
- **Conquistas** — 7 conquistas com notificação em tela ao desbloquear.
- **Ranking local** — top 5 pontuações salvas no navegador.
- **Áudio procedural** — motor, música ambiente e efeitos sonoros gerados via Web Audio API (sem arquivos de áudio), com botão de mudo.
- **Controles touch** — jogável em celular, com botões na tela.

Todo o progresso (moedas, carros/cenários desbloqueados, conquistas, ranking, melhor do desafio diário, preferência de mudo) é salvo em `localStorage`, no navegador do jogador.

## Estrutura do projeto

```
index.html   → estrutura das telas (HUD, garagem, ranking, etc.)
style.css    → visual e responsividade
game.js      → toda a lógica do jogo (única IIFE, sem módulos/build)
```

## Tecnologia

Apenas HTML, CSS e JavaScript vanilla, renderizado em `<canvas>`. Não há framework, bundler ou dependências de terceiros — o projeto roda igual a partir de qualquer servidor estático ou diretamente do disco.
