# Prompt para Claude: reestructurar la memoria del TFM (capítulos 5-8 + Discussion)

Pega esto entero en una sesión nueva de Claude. Contiene todo el contexto necesario — no
hace falta que investigue ni adivine nada, todos los datos y archivos están aquí.

## Mi petición exacta

Quiero que me ayudes a decidir la estructura final de mi memoria (TFM, DTU): cuántas
secciones hacen falta de verdad, en qué orden van, y si algo se solapa o falta. Tengo ya
4 capítulos reescritos en LaTeX (rutas abajo) y necesito una revisión estructural fresca,
no que reescribas el contenido otra vez — el contenido ya está bien, lo que dudo es la
arquitectura.

## Contexto del proyecto

TFM: "Multi-objective Optimisation of Business Processes via Reinforcement Learning" (DTU).
Framework: grafos DCR (Dynamic Condition Response) + PPO con shielding (DCR shield bloquea
acciones ilegales antes de ejecutarlas, sin aprendizaje involucrado en el bloqueo) + reward
escalarizado multi-objetivo (coste, duración) vía pesos (α,β). Tres contribuciones: C1
(compliance estructural garantizada, no solo aprendida), C2 (recuperación de frente de
Pareto vía RL), C3 (acción role-conditioned + asignación bajo capacidad limitada).

## La distinción clave que quiero que quede MUY clara en la memoria

**Internal Validation (Cap. 7) y External Validation (Cap. 8) NO hacen lo mismo, aunque
parezcan repetir el mismo tipo de comparación.** Esto es lo que más me importa que
entiendas bien antes de tocar nada:

- **Internal Validation** = sobre LoanApp (el grafo que usé TODO el tiempo mientras
  calibraba reward/shield/hiperparámetros). Demuestra dos cosas, DENTRO de esa misma
  tarea: (a) que la política no sobreajustó a una semilla o a un periodo concreto del log
  (seeds + temporal holdout + conformance replay), y (b) que el resultado viene de
  combinar shield+aprendizaje, no de uno solo (ablation: saferl vs rl_only vs
  shield_only). Es "¿esta política concreta generaliza dentro de su propia tarea?".

- **External Validation** = sobre 6 grafos de Tobias (DCR-discover, minados de logs
  reales, nunca tocados durante el diseño del método). Repite las MISMAS dos pruebas
  (ablation + ¿hay sobreajuste/réplica?), pero entrenando una política **nueva, desde
  cero**, en cada grafo. No es "la misma política funciona en otro sitio" — es "el
  método, reentrenado de cero en una tarea completamente distinta, produce el mismo
  patrón cualitativo". Además, aquí SÍ hay ground truth de un solver exacto (MiniZinc/
  CSP+COP) en 5 de los 6 grafos, algo que LoanApp nunca tuvo. Es "¿el método generaliza
  a través de tareas, no solo dentro de una?".

Si me ayudas a reescribir cualquier frase de apertura de estos capítulos, mantén esta
distinción explícita y no la disuelvas en "robustez" genérica — son dos amenazas a la
validez distintas (overfitting dentro de tarea vs generalización entre tareas) y quiero
que el lector vea que las dos están cubiertas, no una sola repetida dos veces.

## Estructura actual (orden ya decidido, no lo cuestiones salvo que veas algo roto)

1. Cap. 5 — Experimental Setup (`chap:experimental_setup`)
2. Cap. 6 — Results (`chap:results`): Expense Report (EQ1/EQ2) + Loan Application
   escalabilidad/roles (EQ3/EQ4)
3. Cap. 7 — Internal Validation (`chap:internal_validation`): EQ5, ablation + seeds +
   temporal holdout + conformance replay, todo sobre LoanApp
4. Cap. 8 — External Validation (`chap:external_validation`): NUEVO capítulo, los 6
   grafos de Tobias
5. Discussion (`chap:discussion`)

Esta cadena de razonamiento ya la validamos: Results primero (qué produce el método),
Internal después (por qué — ablation, EQ5 ya estaba definido así en la tabla de
trazabilidad de Cap. 5), External al final (generaliza fuera de donde se construyó).
**No reordenes esto a menos que encuentres una razón de peso que no hayamos visto.**

## Archivos ya escritos (léelos antes de proponer cambios)

Todos en `/Users/sofia/dcr-js/dcr-gymnasium-agent/python/scripts/external_validation/`:

- `Chapter5_ExperimentalSetup_REVISED.tex` — arreglado: tenía la sección "Baselines"
  duplicada literalmente dos veces (mismo `\label{sec:baselines}`), ya corregido.
- `Chapter6_Results_REVISED.tex` — arreglado: la sección de LoanApp se llamaba a sí misma
  "External Validation" sin serlo (es el mismo benchmark de Cap. 7). Renombrada y
  reencuadrada como "Scalability and Role-Conditioned Trade-offs", con cross-references
  explícitas a Cap. 7 (estabilidad de seeds) y Cap. 8 (generalización real).
- `Chapter7_InternalValidation_REVISED.tex` — arreglado: añadidas cross-references hacia
  Cap. 6 (el frente de 26 puntos ya no se re-presenta como si fuera nuevo en la tabla de
  ablation, se cita).
- `Chapter8_External_Validation.tex` — escrito de cero esta semana, con los datos de
  abajo. Aún tiene una sección (8.2, política de coste/duración) con resultados ya
  cerrados que faltan por pegar en el TODO (te los doy abajo, sección "Resultados que
  faltan insertar").
- `Chapter_Discussion_REVISED.tex` — arreglado: (1) párrafo duplicado literal en
  §discussion_doumeni borrado, (2) overlap entre §discussion_roles y §discussion_doumeni
  recortado, (3) viñeta de Limitations "Single seed" corregida (sí hay n=4 seeds, la
  contradicción con Cap. 7 era real), (4) añadida viñeta de Limitations sobre el techo de
  escalabilidad (no existía antes).

## Resultados / tablas de los entrenos (para que no tengas que inventar ni pedírmelos)

### A. Rejilla de validación externa (6 grafos Tobias, dataset DCR-discover)

Selección por tamaño/densidad/tipo (densidad = fórmula de Abbad-Andaloussi et al., ESWA
2023: max sobre componentes débilmente conexos de constraints/actividades):

| Grafo | Actividades | Densidad | Tamaño | Tipo dominante | COP (300s) |
|---|---|---|---|---|---|
| 04 (BPI13 Incidents) | 4 | 1.75 | small | mixed | resuelve, 1 punto |
| 01 (Artificial 0-noise) | 8 | 1.60 | small | exclusion-heavy | resuelve, 1 punto |
| 05 (Synthetic Review Lg) | 14 | 6.00 | medium | condition-heavy | resuelve, 2 puntos |
| 03 (BPI20 RFP) | 19 | 10.32 | medium | mixed | resuelve, 1 punto |
| 11 (BPI19) | 42 | 14.52 | large | exclusion-heavy | resuelve, 2 puntos |
| 09 (Large Bank Txn) | 113 | 12.17 | large | exclusion-heavy | **timeout** |

04,01,03,11 son controles (L_min no-trivial=1, triviales, presupuesto reducido: 2 pesos,
25k steps). 05 es el ancla (cadena real de 6 pasos, presupuesto completo: 6 pesos, 100k
steps). 09 es el caso de escala (cadena no-trivial de 51 pasos vía BFS estructural,
0.31s; MiniZinc no converge en 300s).

Tabla maestra de resultados (4 condiciones: COP, saferl=PPO+shield, rl_only=PPO sin
shield, shield_only=acción aleatoria válida sin aprender):

| Grafo | saferl accept | rl_only accept | shield_only accept | saferl illegal% (decil final) | rl_only illegal% (decil final) | HV saferl | HV COP |
|---|---|---|---|---|---|---|---|
| 04 | 100% | 100% | 100% | 0.18 | 0.13 | 42.0 | 42.0 |
| 01 | 100% | 100% | 100% | 0.12 | 0.30 | 42.0 | 42.0 |
| 05 | 100% | 100% | 100% | 1.77 | 50.7 | 34655.5 | 34655.5 |
| 03 | 100% | 100% | 100% | 3.76 | 2.69 | 800.0 | 800.0 |
| 11 | 99.98% | 100% | 100% | 1.68 | 5.49 | 348.25 | 348.25 |
| 09 | **0%** | no corrido (ya sabíamos que fallaría, ver razón abajo) | **100%** | 98.4 | — | — | — (timeout COP) |

Hallazgos centrales:
1. **Frontera de escalabilidad**: `shield_only` mantiene 100% en los 6 grafos sin
   excepción, incluido el de 113. `saferl` se mantiene al 100% hasta 42, cae a 0% en 113
   — casi el mismo punto donde COP deja de converger.
2. **Réplica de compliance (C1)**: en 05 (único no-trivial con ground truth), la brecha
   saferl/rl_only (1.77% vs 50.7%) replica la de LoanApp (1.0% vs 35.8%, Cap. 7).
3. **Recuperación exacta**: en los 5 grafos con COP, el frente no-dominado de `saferl`
   coincide exactamente con el óptimo (verificado explícitamente en 05: el frente
   recuperado es exactamente `{(335,410),(339,387)}`, ni más ni menos puntos).
4. El hipervolumen de `rl_only` en 05 y 11 es *mayor* que el de COP (239070.5 vs 34655.5;
   1392.25 vs 348.25) — esto NO es un frente mejor, son episodios "aceptantes" inválidos
   por una acción ilegal que corrompe el marcado (mismo fenómeno del exploit
   `Event_10`/"Cancel application" de Cap. 7, aquí en otro grafo).
5. **Por qué no se corrió `rl_only` en 09**: un diagnóstico previo de `saferl` (que ya
   tiene la protección del shield) a 50.000 steps dio 0% de aceptación con
   `illegal_traces_ratio` estancado en 98-100% sin tendencia de mejora — atribuible al
   tamaño del espacio de acciones (113 acciones, normalmente solo 1 legal), no a la
   longitud de la cadena. Si `saferl` (protegido) ya fracasa así, `rl_only` (sin esa
   protección) fracasaría igual o peor con casi total certeza — no se gastó presupuesto
   de cluster en confirmarlo.

Figuras ya generadas (en la misma carpeta, mismo nombre que se referencia en el .tex):
`fig1_illegal_rate_deciles.png`, `fig2_accept_rate_vs_size.png` (la más importante —
headline), `fig3_pareto_vs_cop.png`.

### B. Asignación de capacidad de rol en LoanApp (k=1,2,3,∞) — Q1/Q2 de Cap. 6 §loanapp_capacity

| k | Puntos Pareto | Coste | Duración |
|---|---|---|---|
| 1 | 6 | 1092–1793 | 1245–1632 |
| 2 | 14 | 1092–2454 | 879–1632 |
| 3 | 21 | 1092–2868 | 616–1632 |
| ∞ | 26 | 1092–3120 | 408–1632 |

A nivel de evento (gráfica `loanapp_capacity_results/capacity_allocation_per_event.png`),
3 patrones distintos de asignación del presupuesto Expert según k:
- **Monotónico creciente con el presupuesto** (AML check: 9%→35%→41%→48%; Appraise
  property: 13%→31%→39%→48%) — los eventos de alta sensibilidad ya identificados en
  Discussion §discussion_roles reciben más Expert cuanto más presupuesto hay.
- **Plano en todos los k** (Cancel application: ~50% sea cual sea k) — indiferente al rol
  incluso bajo escasez extrema (más fuerte que el "boundary case" de Assess loan risk, que
  solo es ~50% cuando el presupuesto es ilimitado pero cae a 6% bajo k=1).
- **Decreciente con el presupuesto** (Design loan offer: 70%→61%→52%→41%) — bajo escasez
  extrema (k=1) el agente concentra el presupuesto desproporcionadamente en este evento;
  esa prioridad se diluye a medida que el presupuesto crece. Hallazgo nuevo, no estaba en
  la versión anterior de Discussion.

**Q3 (heurísticas Always-Junior/Always-Expert/Greedy vs política aprendida) — CERRADO.**
(Nota: dos verificaciones preliminares anteriores resultaron erróneas y ya están
descartadas — no las reproduzcas: (a) una prueba con pocos episodios sugería que
Always-Junior/Always-Expert reproducían exactamente los extremos del frente; (b) una
corrida completa posterior, con un bug real en el script de heurísticas — leía el
`action_mask` del servidor para saber si Expert seguía disponible, pero ese mask NO
refleja el agotamiento del presupuesto por diseño del servidor [el agente que aprende
debe descubrir el bloqueo vía penalización, no vía el mask] — hacía que Always-Expert se
quedara atascado proponiendo Expert sin parar tras agotar el presupuesto, bloqueándose
cada vez sin progresar, dando 0% de aceptación bajo k=1,2,3. Ya arreglado: ahora se
consulta `expertBudgetRemaining` directamente. Los números de abajo son los correctos,
post-fix.)

| Presupuesto | Frente aprendido | Frente Greedy | Always-Expert | Always-Junior |
|---|---|---|---|---|
| k=∞ | 26 pts, coste 1092–3120 / dur 408–1632 | 5 pts, 1228–3120 / 408–1910 | 100% acepta, mediana (8932,1171) | 100% acepta, mediana (3126,4683) |
| k=1 | 6 pts, 1092–1793 / 1245–1632 | 2 pts, 1092–1191 / 1550–1632 | 100% acepta, mediana (3248,4566) | 100% acepta, mediana (3126,4683) |
| k=2 | 14 pts, 1092–2454 / 879–1632 | 5 pts, 1092–1892 / 1162–1632 | 100% acepta, mediana (3541,4380) | 100% acepta, mediana (3126,4683) |
| k=3 | 21 pts, 1092–2868 / 616–1632 | 7 pts, 1092–2553 / 796–1632 | 100% acepta, mediana (3996,4200) | 100% acepta, mediana (3126,4683) |

Always-Junior y Always-Expert no están condicionados por (α,β) (no usan los pesos para
decidir el rol), así que no producen un frente — producen una distribución de resultados
bajo orden de evento aleatorio; se resumen por mediana, no por rango.

Tres hallazgos (versión corregida):
1. **La política aprendida extiende el frente más allá de donde llega Greedy** en todos
   los presupuestos: en la región donde ambos operan, las dos curvas van casi pegadas
   (Greedy y la política aprendida convergen a soluciones muy parecidas), pero solo la
   política aprendida alcanza los extremos más baratos y más rápidos — replica la
   conclusión de Kirchdorfer et al. desde un paradigma distinto, y mantiene además la
   garantía de compliance que ninguna heurística tiene por construcción.
2. **Las dos heurísticas no condicionadas por peso (Always-Junior y Always-Expert) son
   mucho peores que cualquiera de las dos políticas optimizadas** en todos los
   presupuestos (mediana de duración por encima de 4000 vs el máximo de 1632 de la
   política aprendida).
3. **El hallazgo más interesante, y el que sustituye al anterior (incorrecto) de "0%
   accept"**: Always-Expert no es significativamente mejor que Always-Junior, a pesar de
   tener acceso a un recurso que Always-Junior nunca usa. En k=2, por ejemplo,
   Always-Expert paga más coste (3541 vs 3126) por una reducción de duración modesta
   (4380 vs 4683) — un retorno mucho menor que el que el mismo presupuesto produce bajo
   Greedy o la política aprendida. Gastar el Expert en el primer evento que toca, sin
   ningún criterio sobre qué eventos se benefician más de él, no captura casi nada del
   valor del recurso: el valor del presupuesto está casi enteramente en *dónde* se gasta,
   no solo en tenerlo disponible, y una regla fija sin noción de coste/duración no puede
   explotar eso.

Ya insertado en `Chapter6_Results_REVISED.tex` (tabla `tab:loanapp_capacity_front`, tabla
`tab:q3_heuristics`, figura `fig:q3_heuristics_k2`, todas con los números corregidos) y
figuras copiadas a `~/Desktop/Thesis DTU/Pictures/`. No necesitas rellenar nada de Q3 — ya
está cerrado y verificado.

### C. Sensibilidad a la política de coste/duración (grafo 05, pregunta del profesor)

Misma duración exacta en las 3 versiones (random/linear/inverse), solo cambia el mapeo a
coste:

| Política | Accept rate | Illegal % (decil final) | Puntos Pareto | Rango coste | Rango duración |
|---|---|---|---|---|---|
| random | 100% | 3.53% | 1 | 371–371 | 350–350 |
| linear | 100% | 4.83% | 1 | 295–295 | 350–350 |
| inverse | 100% | 2.78% | 2 | 327–335 | 350–360 |

**Conclusión**: las 3 curvas de convergencia (illegal rate por decil de entrenamiento) son
prácticamente indistinguibles — caen al mismo ritmo y se estabilizan en el mismo nivel,
sea la política que sea. El frente óptimo cae en una región similar en las 3. Lo único que
cambia es la forma de la nube de episodios dominados: diagonal ascendente con `linear`,
diagonal descendente con `inverse`, sin patrón con `random` — refleja la correlación
coste-duración que cada política impone a nivel de evento, no una diferencia en la
dificultad de aprender. **La política de asignación no afecta a la velocidad ni calidad de
la convergencia.**

Tabla de costes por evento (14 eventos, misma duración en las 3 políticas):

| Evento | Duración | Coste random | Coste linear | Coste inverse |
|---|---|---|---|---|
| Event_1 | 59 | 49 | 50 | 55 |
| Event_2 | 64 | 37 | 54 | 51 |
| Event_3 | 92 | 71 | 77 | 28 |
| Event_4 | 115 | 98 | 96 | 9 |
| Event_5 | 9 | 86 | 8 | 97 |
| Event_6 | 21 | 34 | 18 | 87 |
| Event_7 | 100 | 8 | 83 | 22 |
| Event_8 | 115 | 26 | 96 | 9 |
| Event_9 | 33 | 50 | 28 | 77 |
| Event_10 | 41 | 73 | 35 | 70 |
| Event_11 | 105 | 94 | 88 | 17 |
| Event_12 | 54 | 53 | 45 | 60 |
| Event_13 | 36 | 93 | 31 | 74 |
| Event_14 | 101 | 67 | 84 | 21 |

Figuras: `policy_results/analysis/policy_convergence.png`,
`policy_results/analysis/policy_front_geometry.png`.

## Lo que NO está cerrado todavía (no asumas que existe)

- Q3 de la capacidad de rol y la tabla de §external_policy (Cap. 8) **ya están cerrados y
  pegados** en los `.tex` (no hace falta que los rellenes, ver secciones A/B/C arriba).
- Cap. 4 (Methodology) tiene un TODO heredado sobre alinear la definición de C3 con la
  versión "honesta" (capacity allocation, no solo role-sensitivity) — no lo hemos tocado
  todavía. Esto sigue pendiente.

## Lo que quiero que hagas

1. Lee los 5 archivos `.tex` de arriba.
2. Dime si la estructura (nº de secciones por capítulo, nivel de detalle) es razonable o
   si algo debería fusionarse/partirse — con la salvedad de que el ORDEN de capítulos
   (5→6→7→8→Discussion) ya está decidido y no lo cuestiones salvo razón de peso.
3. Si propones partir Discussion en dos capítulos (lo discutimos y quedó pendiente —
   son 8 secciones de prosa densa en un único capítulo), dame tu recomendación con
   justificación, no asumas que ya decidimos eso.
4. Inserta los datos de las secciones A/B/C arriba donde corresponda en el `.tex` (Cap. 8
   §external_policy tiene TODOs esperando justo estos números).
5. No reescribas el contenido analítico que ya está — solo estructura, huecos, y
   coherencia entre capítulos.
