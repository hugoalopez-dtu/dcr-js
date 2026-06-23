# Borrador — Sección de Validación Externa (Safe RL vs RL-only vs Shielding-only vs COP)

**Estado de los datos**: completo para los 6 grafos y las 3 condiciones
correspondientes (04, 01, 03, 11, 05, 09). Pendiente: ronda de sensibilidad a
la política de coste/duración (random/lineal/inversa) sobre 05, corriendo en
el cluster.

---

## Propósito

La validación interna (Cap. X, LoanApp junior/senior) estableció que el
shielding produce políticas más conformes que el RL sin restricciones
(`saferl` vs `rl_only`). Esta sección replica esa misma comparación en una
**rejilla de grafos DCR minados de procesos reales** (dataset de Tobias,
s205358, vía DCR-discover), elegida específicamente porque:

1. Ninguno de estos grafos influyó en el diseño del shield, la función de
   recompensa o los hiperparámetros (a diferencia de LoanApp, que formó
   parte del mismo ciclo de desarrollo del método).
2. El coste/duración de cada actividad se asignó con una política aleatoria
   sembrada (seed=1), sin intervención manual.
3. Cubre de forma natural la rejilla tamaño/densidad/tipo-de-constraint
   pedida como criterio de robustez, usando la métrica de densidad de
   Abbad-Andaloussi et al. (ESWA 2023): `Density(G) = max` sobre componentes
   débilmente conexos de `constraints/actividades`.

## Grafos del benchmark

| Grafo | Actividades | Densidad | Tipo dominante | COP (MiniZinc) |
|---|---|---|---|---|
| 04 (BPI13 Incidents) | 4 | 1.75 (sparse) | mixed | resuelve, 1 punto |
| 01 (Artificial 0-noise) | 8 | 1.60 (sparse) | exclusion-heavy | resuelve, 1 punto |
| 05 (Synthetic Review Lg) | 14 | 6.00 (moderate) | condition-heavy | resuelve, **2 puntos** |
| 03 (BPI20 RFP) | 19 | 10.32 (dense) | mixed | resuelve, 1 punto |
| 11 (BPI19) | 42 | 14.52 (dense) | exclusion-heavy | resuelve, 2 puntos |
| 09 (Large Bank Txn) | 113 | 12.17 (dense) | exclusion-heavy | **timeout (300s)** |

04, 01, 03 y 11 son estructuralmente triviales (longitud mínima de traza
aceptante no-trivial = 1 — ver Fase 1, BFS estructural); se incluyen como
**controles**, no como resultados centrales, con presupuesto reducido (2
pares de pesos, 25k steps) ya que el patrón completo se observa en pocos
miles de steps. **05** es el ancla de validez (única cadena no-trivial real
con ground truth completo, 6 pasos). **09** es el caso de escala (cadena
no-trivial de 51 pasos, donde MiniZinc no converge).

## Condiciones comparadas

- **COP**: solver exacto MiniZinc+Gecode (Diaz et al.), techo de referencia donde existe.
- **`saferl`**: PPO + shielding (método completo).
- **`shield_only`**: política aleatoria restringida a acciones válidas, sin aprendizaje — aísla cuánto del resultado viene solo de la restricción estructural.
- **`rl_only`**: PPO sin shielding (`SHIELD_DISABLED=1`) — la comparación ya usada en LoanApp, replicada aquí.

Mismos hiperparámetros que LoanApp/Expense Report (`STEP_PENALTY=-1.5`,
`MAX_EPISODE_STEPS=300`, `ent_coef=0.1`), mismo barrido de 6 pares (α,β) donde
el presupuesto lo permite.

---

## Resultados

### Figura 2 — Frontera de escalabilidad (la más importante)

`shield_only` mantiene 100% de aceptación en los 6 grafos **sin excepción**,
incluido el de 113 actividades. `saferl` se mantiene también al 100% hasta
42 actividades, pero **se desploma a 0%** en el grafo de 113 — el mismo
punto, aproximadamente, donde MiniZinc deja de converger. `rl_only` no se
corrió en el grafo 09 (marcado explícitamente en la figura): el diagnóstico
previo (50k steps, ~98% de acciones ilegales sin tendencia de mejora) ya
indicaba que fallaría al menos tan mal como `saferl`, sin shield siquiera
para garantizar que el estado del grafo no se corrompiera.

**Lectura**: el shielding por sí solo (sin aprendizaje) es la única condición
que escala hasta donde la enumeración exacta de MiniZinc deja de ser viable.
El aprendizaje (`saferl`) añade valor allí donde puede competir con el
tamaño del espacio de acciones (≤42 actividades en este estudio), pero no
allí donde el espacio de acciones (113 posibles, normalmente 1 legal) supera
lo que un PPO sin *action masking* puede explorar en un presupuesto
razonable.

### Figura 1 — Tasa de acción ilegal por decil de entrenamiento

En los 4 grafos-control (triviales), la brecha entre `saferl` y `rl_only` es
pequeña — esperable, ya que el espacio de acciones es pequeño (4-19) y
cualquier acción tiene una probabilidad razonable de ser legal incluso sin
restricción. En **05** (la única cadena no-trivial real, 6 pasos, 14
acciones), la brecha es grande y **replica el patrón de LoanApp con un
margen incluso mayor**:

| Métrica (último decil) | LoanApp (interno) | 05 (externo) |
|---|---|---|
| `saferl` ilegal % | 1.0% | 1.77% |
| `rl_only` ilegal % | 35.8% | 50.7% |

La réplica de esta brecha en un grafo nunca visto durante el desarrollo del
método es la validación externa central de la contribución C1 ("un simple
penalty no garantiza cumplimiento; el shielding sí").

### Figura 3 — Frente de Pareto recuperado vs ground truth de MiniZinc

La figura distingue explícitamente, dentro de todos los episodios aceptados
por `saferl` en el último 20% de entrenamiento, el **subconjunto no-dominado**
(verde, resaltado) del resto (gris, tenue) — no basta con mostrar la nube
completa de episodios aceptados, ya que la mayoría son válidos pero
subóptimos para el peso (α,β) con que se entrenaron; lo relevante es si el
frente no-dominado coincide con el óptimo de MiniZinc. Verificado
explícitamente: en 05, el frente no-dominado de `saferl` es **exactamente**
`{(335,410), (339,387)}` — los 2 puntos de MiniZinc, ninguno de más ni de
menos. En 04, 01, 03 y 11, el único punto no-dominado coincide igualmente
con el óptimo de MiniZinc (visible en la figura como el punto verde sobre la
estrella hueca).

**Nota importante sobre `rl_only`**: su hipervolumen calculado es, en 05 y
11, *mayor* que el de COP (239,070 vs 34,655 en 05; 1,392 vs 348 en 11) —
esto **no** significa que `rl_only` encuentre un frente mejor. Inspeccionando
los puntos: son combinaciones de coste/duración muy bajas que no
corresponden a ninguna traza válida de 6 pasos — son episodios marcados como
"aceptantes" tras una acción ilegal que corrompe el marcado (el mismo
fenómeno del "Event\_10 exploit" ya documentado para LoanApp). Esto refuerza,
no contradice, la necesidad de reportar **validez de traza ejecutada**
(`executed-trace validity`) junto al hipervolumen — un hipervolumen alto con
trazas inválidas no es una mejora real.

---

## Tabla maestra (resumen)

| Grafo | Tamaño | Densidad | Tipo | `saferl` accept | `rl_only` accept | `shield_only` accept | `saferl` ilegal% (final) | `rl_only` ilegal% (final) | HV `saferl` | HV COP |
|---|---|---|---|---|---|---|---|---|---|---|
| 04 | small | sparse | mixed | 100% | 100% | 100% | 0.18% | 0.13% | 42.0 | 42.0 |
| 01 | small | sparse | excl-heavy | 100% | 100% | 100% | 0.12% | 0.30% | 42.0 | 42.0 |
| 05 | medium | moderate | cond-heavy | 100% | 100% | 100% | 1.77% | 50.7% | 34655.5 | 34655.5 |
| 03 | medium | dense | mixed | 100% | 100% | 100% | 3.76% | 2.69% | 800.0 | 800.0 |
| 11 | large | dense | excl-heavy | 99.98% | 100% | 100% | 1.68% | 5.49% | 348.25 | 348.25 |
| 09 | large | dense | excl-heavy | **0%** | no corrido | **100%** | 98.4% | — | — | — (timeout COP) |

---

## Conclusión (borrador de párrafo de cierre)

Esta validación externa confirma, en seis grafos DCR minados de procesos
reales y nunca usados en el desarrollo del método, el hallazgo central de la
validación interna: una señal de penalización simple no es suficiente para
garantizar cumplimiento estructural (`rl_only` muestra una tasa de
ilegalidad sostenida y, en los casos no triviales, episodios "aceptantes"
que en realidad no son ejecuciones válidas del proceso). Más allá de la
réplica, esta rejilla expone una frontera de escalabilidad que LoanApp no
podía mostrar por sí sola: `saferl` recupera el óptimo exacto de MiniZinc en
todos los grafos hasta 42 actividades, pero colapsa en el grafo de 113 — el
mismo punto, aproximadamente, donde el solver exacto deja de converger. Sin
embargo, **incluso en ese caso límite, el shielding por sí solo
(`shield_only`, sin ningún aprendizaje) sigue produciendo trazas válidas de
forma fiable** — la versión defendible de la afirmación de que el shielding
aporta valor donde la programación por restricciones no llega: no por
velocidad, sino porque garantiza ejecuciones estructuralmente válidas
incluso cuando ni el solver exacto ni el RL sin masking pueden producir
nada.
