# Character Specs

> Valores em pixels (px) e milissegundos (ms). Gravidade global: **900 px/s²**.

---

## Fighter

| Atributo | Valor |
|---|---|
| **Vida (HP)** | 100 |
| **Velocidade de corrida** | 280 px/s |
| **Hitbox** | 36 × 48 px |
| **Altura do pulo** | ~150 px |
| **Pulo duplo** | Sim |
| **Dano de ataque (corpo a corpo)** | 25 |
| **Alcance do ataque** | 70 px |
| **Cooldown do ataque** | 600 ms |
| **Knockback** | 280 px/s |
| **Dano do combo (dash)** | 28 |
| **Distância do slide no chão** | ~90 px |
| **Distância do combo dash** | 210 px |
| **Cooldown slide / combo** | 5 s (compartilhado) |

---

## Runner

| Atributo | Valor |
|---|---|
| **Vida (HP)** | 75 |
| **Velocidade de corrida** | 380 px/s |
| **Hitbox** | 28 × 38 px |
| **Altura do pulo** | ~174 px |
| **Pulo duplo** | Sim |
| **Tipo de ataque** | Projétil (à distância) |
| **Dano do projétil** | 18 |
| **Velocidade do projétil** | 600 px/s |
| **Cooldown do ataque** | 450 ms |
| **Knockback** | 180 px/s |
| **Dano do combo (dash)** | 32 |
| **Distância do slide no chão** | ~122 px |
| **Distância do combo dash** | 210 px |
| **Cooldown slide / combo** | 5 s (compartilhado) |

---

## Tank

| Atributo | Valor |
|---|---|
| **Vida (HP)** | 150 |
| **Velocidade de corrida** | 180 px/s |
| **Hitbox** | 48 × 58 px |
| **Altura do pulo** | ~108 px |
| **Pulo duplo** | Sim |
| **Dano de ataque (corpo a corpo)** | 35 |
| **Alcance do ataque** | 55 px |
| **Cooldown do ataque** | 900 ms |
| **Knockback** | 420 px/s |
| **Dano do combo (dash)** | 40 |
| **Distância do slide no chão** | ~58 px |
| **Distância do combo dash** | 210 px |
| **Cooldown slide / combo** | 5 s (compartilhado) |

---

## Mecânicas de movimento (todos os personagens)

| Mecânica | Valor |
|---|---|
| **Wall slide** — velocidade máxima de queda | 70 px/s |
| **Wall slide** — apenas ao cair (não ao subir) | Sim |
| **Wall slide** — usos por pulo | 1 |
| **Wall jump** — impulso horizontal | 340 px/s |
| **Wall jump** — bloqueia re-agarrar parede** | 250 ms |
| **Combo dash** — velocidade | 700 px/s |
| **Combo dash** — duração | 300 ms |
| **Combo dash** — distância (reta/diagonal igual) | 210 px |
| **Slide no chão** — multiplicador de velocidade | 1,8× a velocidade do personagem |
| **Slide no chão** — duração | 320 ms |
| **Cooldown de ação** (slide/combo compartilhado) | 5 s |

> A distância do slide no chão varia por personagem pois usa a velocidade base × 1,8 com desaceleração progressiva (×0,93 por frame a 60 fps).
> A distância do combo dash é igual para todos pois usa velocidade fixa de 700 px/s independente do personagem.
