# Contexto: de la Fase 1 de MiniZinc a la validación externa de Safe RL

Este documento resume el razonamiento completo de cómo llegamos al plan actual,
para poder explicárselo a otra sesión de Claude (o a un humano) sin contexto previo.

## 0. Punto de partida (tesis)

TFM: "Multi-objective Optimisation of Business Processes via Reinforcement
Learning" (DTU). Metodología: grafos DCR con coste/duración por evento (EDCR,
Diaz et al. DEC2H 2023), agente PPO con recompensa escalarizada
`r = r_structural - α·cost - β·duration`, barrido de 6 pares (α,β), extracción
de frente de Pareto post-entrenamiento. Validación interna ya hecha con
Expense Report (recupera el frente exacto de Diaz et al.) y LoanApp
junior/senior (con roles, ablation saferl vs rl_only ya documentado en la
tesis con figuras y tabla).

## 1. Llega un dataset nuevo: grafos DCR minados (Tobias, s205358)

Mi profesor compartió un dataset de 11 grafos DCR reales, minados de logs de
proceso reales (BPI Challenges, Sepsis, Hospital Billing, etc.) por la tesis
de otro estudiante (Tobias). Formato `dcr:definitions/dcr:event/dcr:relation`
(distinto del formato XML que usa nuestro motor `dcr-js`). Sin coste, sin
duración, sin roles — hay que asignarlos.

Orden de tamaño pedido: 04 (4 act) → 01 (8) → 05 (14) → 03 (19) → 11 (42) → 09 (113).

## 2. Fase 1 — barrido de MiniZinc con timeout

Construí un conversor (`tobias_converter.py`) del formato Tobias al dict que
espera el solver CSP+COP de Diaz et al. (`pymzn_MultiObj_AsFunct.py`, vendorizado
en `dcrGraph/`), con asignación de coste/duración sintética (seed=1, rango
uniforme [5,100]€/[5,120]min). Corrí MiniZinc con timeout de 300s en los 6 grafos:

| Grafo | Act | Rel | Densidad | MiniZinc |
|---|---|---|---|---|
| 04 | 4 | 7 | 1.8 | resuelve instantáneo |
| 01 | 8 | 11 | 1.4 | resuelve instantáneo |
| 05 | 14 | 84 | 6.0 | resuelve instantáneo (2 puntos Pareto) |
| 03 | 19 | 196 | 10.3 | resuelve instantáneo |
| 11 | 42 | 610 | 14.5 | resuelve instantáneo (2 puntos Pareto) |
| 09 | 113 | 1488 | 12.2 | **timeout (300s)** |

## 3. Hallazgo clave: todos son trivialmente aceptantes (L_min=0)

Escribí un BFS estructural (`compute_lmin.py`) que replica exactamente la
semántica del modelo MiniZinc (incluyendo el detalle no obvio de que un
evento ejecutado queda exento de la regla "pending bloquea aceptación" para
siempre, aunque vuelva a quedar pending). Resultado: **los 6 grafos aceptan
con la traza vacía** (L_min estructural = 0) — confirma la advertencia que ya
tenía anotada: "grafos minados de logs reales suelen tener pendingResponses
vacío → aceptación trivial".

Pero el modelo MiniZinc no puede representar la traza vacía (fuerza ≥1 evento
real), así que en la práctica devuelve la traza no-trivial mínima:
- 04, 01, 03, 11 → 1 solo evento (cualquier acción inicial "inocua")
- **05 → 6 pasos** (todas las ramas iniciales disparan una respuesta que obliga
  a completar la cadena de revisión: invite_reviewers → {time_out_2|get_review_2}
  → get_review_3 → get_review_1 → collect_reviews → decide)
- **09 → 51 pasos** (cadena larga, encontrada por el BFS en 0.31s aunque MiniZinc
  no pueda enumerar el frente completo en 300s)

Esto reencuadró el experimento: **05 = ancla de validación** (pequeño, no
trivial, ground truth exacto), **09 = la "victoria de escalabilidad"
potencial** (MiniZinc no llega, pero existe una traza válida).

## 4. Primer intento de Fase 2: entrenar RL en el grafo 09

Generé el XML del motor (`Mined_09_LargeBankTransaction.xml`, mismo coste/
duración que el ground truth de MiniZinc) y corrí un diagnóstico barato local
(50.000 steps, peso baseline α=0,β=0) antes de comprometer el sweep completo
de 6 pesos × 100k en cluster.

**Resultado: 0% de aceptación, illegal_traces_ratio ~98-100% sin tendencia de
mejora en 44 episodios.** Investigando la causa: el grafo 09 tiene 113
acciones posibles pero normalmente solo 1 es legal en cada estado. El PPO
estándar (sin action masking) muestrea sobre las 113 acciones sin restricción,
así que la probabilidad de acertar una acción legal al azar es ~1/113≈0.9%.

## 5. Aclaración importante: el shielding YA estaba activo, y no basta

Verifiqué que el motor (`dcr-engine/src/generation.ts`) tiene un mecanismo de
**shielding activado por defecto** (`SHIELD_DISABLED` hay que ponerlo a "1"
explícitamente para desactivarlo): si la acción es ilegal, se bloquea, el
estado del grafo **nunca avanza**, solo se devuelve reward=-10. Esto es
diferente de "acción ilegal se ejecuta y corrompe el estado" — mi análisis
inicial decía eso y era incorrecto.

Pero el shielding **no resuelve** el problema del grafo 09: protege de que el
estado se corrompa, pero el agente sigue muestreando sobre las 113 acciones
totales sin que el shield le diga POR ADELANTADO cuáles son legales. Resultado:
sigue gastando ~99% de cada episodio en intentos bloqueados, sin avanzar nunca.
La solución estándar para esto es **action masking** (restringir el muestreo
de antemano, no solo bloquear después) — técnica usada en literatura
(confirmado luego, ver sección 8).

## 6. Barrido de escalado sintético — ¿dónde se rompe cada método?

Con solo 6 grafos reales no se puede mapear la frontera de fallo de forma
controlada. Construí un generador propio (`random_dcr_generator.py`):
cadena secuencial forzada (`condition`+`response` consecutivos) + ruido
aleatorio encima (cuidando que el ruido no cree ciclos de dependencia con la
cadena base, que si no deadlockea el grafo desde el inicio). Corrí en
paralelo: (a) MiniZinc con timeout 300s, (b) diagnóstico RL barato local
(20k steps, baseline), para N=20,40,60,80,100 eventos.

| N | MiniZinc | RL accept_rate (último 20%) | RL illegal% |
|---|---|---|---|
| 20 | resuelve (86s) | 100% | 42.9% |
| 40 | resuelve (30s) | 100% | 56.9% |
| 60 | **timeout** | **7.7%** (colapsando) | 71.5% |
| 80 | timeout | 0% | 86.6% |
| 100 | timeout | 0% | 89.5% |

**Las dos fronteras (MiniZinc y RL sin masking) caen casi en el mismo punto
(N≈60).** Conclusión honesta: con la metodología actual (PPO + shield, sin
masking), no hay ninguna ventana clara donde el RL "gane" en escalabilidad
frente a COP — el argumento de tesis original ("RL escala donde COP no")
no está soportado empíricamente con esta implementación.

## 7. Decisión: no implementar masking todavía — pivotar el framing

En vez de arreglar el masking (cambio de método, rompería comparabilidad con
los experimentos ya validados de LoanApp/Expense Report), decidimos **no
pelear por la escalabilidad bruta** y reencuadrar la pregunta: ¿el shielding
en sí (no "RL gana en velocidad/tamaño a COP") aporta valor robusto, replicado
a través de grafos minados estructuralmente distintos?

## 8. Búsqueda de literatura: ¿existe un benchmark RL+DCR previo?

Busqué exhaustivamente (Google/arXiv/Papers with Code) papers que combinen RL
con grafos DCR. **No existe ninguno** — ni siquiera el grupo que inventó DCR
(Hildebrandt, Slaats, ITU Copenhagen) tiene trabajo publicado conectándolo con
RL. El pariente más cercano es Agarwal et al. (BPM 2022, arXiv:2205.03219):
RL + conformidad de proceso (no DCR, más parecido a un Directly-Follows
Graph), y **usan `MaskablePPO` explícitamente por el mismo problema que
encontramos** — confirma independientemente que el masking es la técnica
estándar para este tipo de problema. Sin código público disponible.

## 9. El mensaje del profesor: reencuadre definitivo

El profesor propuso usar el dataset de grafos minados para testear
**robustez** del shielding, con una rejilla de características:
- Tamaño: small (1-10 act) / medium (11-30) / large (30+, "cognitive overload")
- Densidad: sparse/moderate/dense, según la métrica de Abbad-Andaloussi et al.
  (ESWA 2023): `Density(G) = max` sobre componentes débilmente conexos de
  `constraints/actividades` en ese componente (verifiqué la fórmula exacta
  leyendo el paper, no es solo "relaciones/eventos" global)
- Tipo de constraint dominante: condition/response/inclusion/exclusion-heavy/mixed
- Inspirarse en López-Pintado et al. ("Silhouetting the Cost-Time Front") para
  visualizar el frente cost-duration
- Pregunta abierta: ¿la política de asignación de coste/duración (lineal,
  inversa, aleatoria) afecta a la convergencia?
- Lectura recomendada: "Quality Assessment of Pareto Set Approximations" →
  usar un quality indicator (hipervolumen) para comparar frentes, no solo
  "coinciden los puntos"

Los 6 grafos de Tobias YA cubren bien esta rejilla (tabla en sección 2/9 del
README del dataset), salvo el hueco "response-heavy" (ningún grafo real lo es).

## 10. Por qué esto NO es repetir la validación interna de LoanApp

Discutido explícitamente: LoanApp viene de un log real, pero (a) los costes
los asigné yo a mano, y (b) el grafo formó parte del mismo ciclo en el que se
calibró el shield/reward/hiperparámetros — no es un caso "ciego". Los grafos
de Tobias (en particular 05, elegido como el caso ancla porque tiene
ground truth de MiniZinc Y estructura no trivial) nunca influyeron en ninguna
decisión de diseño del método — son la validación externa genuina.

## 11. El diseño de 4 condiciones

Por cada grafo: **COP** (MiniZinc, techo de referencia donde existe) vs
**`saferl`** (PPO+shield, método completo) vs **`shield_only`** (acción
aleatoria válida, sin aprender — aísla cuánto viene solo de la restricción
estructural) vs **`rl_only`** (PPO sin shield — la comparación que ya existe
para LoanApp, ahora replicada en la rejilla).

Predicción (a confirmar con los datos reales): en grafos pequeños/triviales,
las tres condiciones deberían convergen igual (techo, nada que demostrar). En
05, `saferl` debería recuperar el frente exacto de 2 puntos y `shield_only`
probablemente no (válido pero subóptimo). En grafos grandes (09, posiblemente
11), es plausible que `shield_only` iguale o supere a `saferl` en tasa de
aceptación, porque `shield_only` SOLO muestrea entre acciones legales —
nunca pierde un paso en algo ilegal — mientras que `saferl` sigue
muestreando sobre el espacio de acciones completo y el shield solo bloquea
después. Si esto se confirma, es la versión honesta y defendible de "el
shielding ayuda donde COP no": incluso la versión más simple con shield ya
produce trazas válidas donde COP no produce nada, mientras que sin shield ni
eso está garantizado.

## 12. Estado de la ejecución (lo que falta resolver ahora)

Construí: conversión de los 6 grafos al XML del motor (mismo seed=1 que el
ground truth), script genérico de ablation (`run_ablation_mined.py`, sin
dependencia de `nvm` en local, con ella en cluster), script de análisis
(`analyze_mined_ablation.py`: 3 figuras + tabla maestra + hipervolumen).
Piloto local (steps reducidos) confirmado limpio en los 6 grafos × 3
condiciones.

Lancé el sweep completo en el cluster (6 jobs, una condición tras otra
encadenada con `&&` dentro de cada job). Primer intento falló por un bug de
ruta relativa (el adaptador Node arranca con cwd=`node-adapter/`, y la ruta
relativa al XML se resolvía mal desde ahí) — arreglado. Segundo intento: los
6 jobs corrieron de verdad pero **todos murieron por `TERM_RUNLIMIT`** —
cada combinación de pesos a 100k steps tarda ~23-29 minutos (no los ~2 min
que asumíamos de un benchmark de LoanApp que en realidad nunca se verificó
empíricamente, era una estimación). Con 6 pesos eso son ~2.5-3h solo para
`saferl`, antes de llegar siquiera a `rl_only` o `shield_only`.

Arreglé el script para que salte combinaciones de peso ya completadas
(reanudable), y la siguiente decisión pendiente es: ¿reducir presupuesto en
los grafos triviales (04,01,03,11 — el patrón ya se ve con 20-30k steps en
los pilotos) y mantener el presupuesto completo de 100k solo en 05 (ground
truth) y posiblemente 09 (ya tenemos bastante señal del diagnóstico previo de
50k steps, podría no necesitar repetirse)? Esa es la pregunta abierta ahora
mismo.

También preparado pero no lanzado: ronda extra sobre grafo 05 con 3 políticas
de asignación de coste/duración (`uniform_random`, `linear` "más tiempo=más
dinero", `inverse` "menos tiempo=más dinero") compartiendo las mismas
duraciones exactas (mismo seed para duración, solo cambia el mapeo a coste),
para responder la pregunta del profesor sobre si la política afecta a la
convergencia del PPO.
