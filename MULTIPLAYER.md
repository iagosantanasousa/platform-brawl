# Multiplayer — Estado atual e próximos passos

## O que foi feito

### Arquitetura escolhida
- **Backend:** Colyseus 0.17 (`@colyseus/core`) com WebSocket transport
- **Frontend:** `colyseus.js` 0.16 (última versão disponível no npm)
- **Modelo:** 1v1 PvP, salas com código de 4 caracteres, física autoritativa no servidor

---

### Server (`server/src/`)

#### `index.ts` ✅
- Substituiu o servidor socket.io pelo Colyseus
- Registra a sala `'battle'` → `BattleRoom`
- Usa `WebSocketTransport` na porta `process.env.PORT ?? 4000`

#### `schemas/PlayerSchema.ts` ✅
- Schema Colyseus com todos os campos do jogador:
  `id, characterType, x, y, velocityX, velocityY, hp, maxHp, facing, isGrounded, jumpsUsed, attackCooldown, isDead, knockbackX`

#### `schemas/ProjectileSchema.ts` ✅
- Schema Colyseus com campos do projétil:
  `id, ownerId, x, y, velocityX, velocityY, damage`

#### `schemas/BattleRoomState.ts` ✅
- Schema raiz da sala:
  `mapId, phase, winner, countdown, tick`
  + `players: MapSchema<PlayerSchema>`
  + `projectiles: MapSchema<ProjectileSchema>`

#### `rooms/BattleRoom.ts` ✅
- `maxClients = 2`
- `onCreate`: gera roomId de 4 chars (sem letras ambíguas), inicializa estado
- `onJoin`: adiciona jogador, inicia countdown quando 2 jogadores conectam
- `onLeave`: remove jogador, encerra batalha se alguém sair durante o jogo
- **Fases:** `waiting → countdown (3s) → battle → finished`
- `setSimulationInterval` a 50Hz (20ms) durante a fase `battle`
- Detecta vitória quando só resta 1 jogador vivo

#### `simulation/ServerPhysics.ts` ✅
- Física isolada que opera diretamente nos schemas Colyseus
- `addPlayer`, `removePlayer`, `applyInput`, `tick`
- Gravidade, movimentação, colisão com plataformas (AABB), double jump
- Ataques melee e ranged (projéteis)
- Knockback, respawn ao cair do mapa
- Detecção de hit de projéteis

#### Arquivos legados (socket.io) — ainda presentes, não usados
- `gameState.ts` — lógica antiga com socket.io
- `rooms.ts` — handlers socket.io antigos

---

### Client (`client/src/`)

#### `game/network/colyseusClient.ts` ✅
- Singleton `colyseusClient` com métodos: `createRoom`, `joinRoom`, `getRoom`, `leave`
- **Fix de versão:** `colyseus.js` 0.16 espera resposta no formato `{ room: { name, roomId } }` mas o servidor 0.17 retorna `{ name, roomId }` direto. A solução foi:
  - Fazer o fetch do matchmaker manualmente (`fetchMatchmaker`)
  - Transformar a resposta para o formato 0.16 (`toV016Format`)
  - Chamar `client.consumeSeatReservation()` com a resposta transformada
- URL do servidor lida de `VITE_SERVER_URL` com fallback para `ws://localhost:4000`

#### `game/scenes/MultiplayerScene.ts` ✅
- Migrado de socket.io para Colyseus
- Usa `room.onStateChange` para sincronizar estado
- Envia input via `room.send('input', input)` a 20fps
- Lerp para jogadores remotos
- Exibe fase (countdown, battle, finished/vitória)

#### `ui/Lobby.tsx` ✅
- Migrado de socket.io para `colyseusClient`
- **Criar sala:** chama `createRoom`, mostra o código de 4 chars, escuta `phase === 'countdown'` para navegar ao jogo
- **Entrar em sala:** chama `joinRoom` com o código digitado
- Tratamento de erros (sala não encontrada, cheia)

---

### Infra / Config

#### `render.yaml` ✅
- Config para deploy do servidor no Render (free tier)
- Build: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter server build`
- Start: `pnpm --filter server start`

#### `client/netlify.toml` ✅
- SPA redirect (`/* → /index.html`)
- Base: pasta `client/`, publish: `dist/`

#### `.gitignore` ✅
- Exclui `node_modules/`, `dist/`, `.DS_Store`, `.env`

---

## Onde paramos

O código está pronto e buildando sem erros. O problema pendente é o **deploy do servidor**.

### Problema de versão (resolvido no código, não testado em prod)
`colyseus.js` 0.16 (cliente) é incompatível com `@colyseus/core` 0.17 (servidor) no protocolo do matchmaker. O `colyseusClient.ts` já contém o workaround (`toV016Format`), mas **ainda não foi testado em produção**.

### Deploy pendente
- Repositório criado no GitHub: `github.com/iagosantanasousa/platform-brawl`
- Servidor ainda **não deployado** no Render
- Faltou: criar o Web Service no Render apontando para o repositório

### Para continuar o deploy
1. Acessar **render.com** → New → Web Service → conectar `iagosantanasousa/platform-brawl`
2. Configurar:
   - Build: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter server build`
   - Start: `pnpm --filter server start`
3. Após o deploy, pegar a URL gerada (ex: `https://platform-brawl-server.onrender.com`)
4. Editar `client/src/game/network/colyseusClient.ts` linha com `RAW_URL`, trocar o fallback:
   ```ts
   ?? 'wss://platform-brawl-server.onrender.com'
   ```
5. Fazer `pnpm --filter client build`
6. Arrastar `client/dist` para o Netlify

---

## Próximos passos de funcionalidade (após deploy funcionar)

- [ ] Testar a partida completa 1v1 em produção
- [ ] HP bar no HUD para ambos os jogadores
- [ ] Tela de fim de jogo com opção de rolar novamente
- [ ] Contagem de vidas / rounds (melhor de 3)
- [ ] Indicador de "servidor acordando" (Render free tier dorme após 15min)
- [ ] Remover arquivos legados: `server/src/gameState.ts`, `server/src/rooms.ts`
