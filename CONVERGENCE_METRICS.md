# Métricas de Convergencia para Análisis de Penalización DCR

## Descripción

Se han agregado métricas de convergencia para analizar cómo **el agente aprende a evitar violaciones de restricciones DCR (illegal traces)** a medida que el entrenamiento progresa.

### Métrica Principal: `illegal_traces_ratio`

**Definición**: Porcentaje de pasos en cada episodio durante los cuales el agente intentó ejecutar una acción ilegal (non-compliant).

```
illegal_traces_ratio (%) = (illegal_traces_count / episode_steps) * 100
```

**Interpretación**:
- **0%**: El agente solo ejecutó acciones legales en el episodio ✅
- **100%**: El agente intento acciones ilegales en todos los pasos ❌
- **Convergencia**: La ratio debe **disminuir** a medida que aumentan los episodios, indicando que el agente está aprendiendo a cumplir con las restricciones

---

## Archivos Modificados

### 1. Servidor Node (`node-adapter/src/server.ts`)

**Cambios**:
- Variable `illegalTracesCount` rastrea acciones ilegales por episodio
- Se incrementa cada vez que `baseMapped === -10` (acción no conforme)
- Se resetea en cada episodio nuevo (`POST /reset`)
- Se incluye en la respuesta junto con `episodeSteps`

**Objeto en respuesta**:
```typescript
{
  illegalTracesCount: number,      // Contador de acciones ilegales en este episodio
  episodeSteps: number,            // Total de pasos ejecutados en el episodio
  baseMapped: -10 | 1 | 100        // -10=ilegal, 1=legal, 100=aceptante
}
```

### 2. Cliente Python (`dcr-gymnasium-agent/.../train_agent.py`)

**Cambios en `StepDebugCallback`**:
- Campos CSV nuevos:
  - `illegal_traces_count`: Contador del servidor
  - `episode_steps`: Pasos totales del episodio
  - `illegal_traces_ratio`: Ratio calculada como porcentaje

- Métricas registradas en **TensorBoard** al final de cada episodio:
  - `train/illegal_traces_ratio`: % de pasos ilegales
  - `train/illegal_traces_count`: Cantidad de pasos ilegales
  - `train/episode_steps`: Longitud total del episodio
  - `train/ep_rew_sum`: Recompensa total (existente)

---

## Cómo Usar

### 1. Visibilizar en TensorBoard

```bash
cd dcr-gymnasium-agent/dcr-gymnasium-agent/python
tensorboard --logdir=./dcr_tensorboard
```

Luego accede a `http://localhost:6006` y busca las métricas:
- **SCALARS** → `train/illegal_traces_ratio`
- **SCALARS** → `train/illegal_traces_count`
- **SCALARS** → `train/episode_steps`

### 2. Analizar en CSV

Los datos también se guardan en:
```
scripts/logs/train_trace_exp_{exp_id}_*.csv
```

**Columnas relevantes** en el CSV:
```
episode, step_in_episode, base_mapped, illegal_traces_count, episode_steps, illegal_traces_ratio
```

Puedes cargar y analizar con Pandas:
```python
import pandas as pd

df = pd.read_csv("train_trace_exp_Pension_30k_v2_s1_*.csv")

# Estadísticas por episodio
episode_stats = df.groupby("episode").agg({
    "illegal_traces_count": "last",
    "episode_steps": "last",
    "illegal_traces_ratio": "last",
    "ep_rew_sum": "last"
})

print(episode_stats)
```

### 3. Comparar Diferentes Penalizaciones

Para analizar si con más penalización converges mejor:

1. **Modificar la penalización en el servidor**:
   ```bash
   STEP_PENALTY=-0.5 npx tsx src/server.ts  # Mayor penalización
   ```

2. **Registrar múltiples experimentos** con diferentes penalizaciones

3. **Comparar en TensorBoard** usando múltiples runs:
   ```
   - exp_Pension_30k_v2_s1_LOW_PENALTY
   - exp_Pension_30k_v2_s1_MEDIUM_PENALTY
   - exp_Pension_30k_v2_s1_HIGH_PENALTY
   ```

4. **Visualizar lado a lado** el gráfico de `train/illegal_traces_ratio` para ver cuál converge más rápido

---

## Interpretación de Resultados

### Convergencia Exitosa ✅
```
Episode 1:    illegal_traces_ratio = 45%
Episode 50:   illegal_traces_ratio = 15%
Episode 100:  illegal_traces_ratio = 2%
```
→ El agente está aprendiendo, la penalización es efectiva

### Convergencia Lenta ⚠️
```
Episode 1:    illegal_traces_ratio = 60%
Episode 50:   illegal_traces_ratio = 55%
Episode 100:  illegal_traces_ratio = 50%
```
→ Considera aumentar la penalización o ajustar el entropy coefficient

### Sin Convergencia ❌
```
Episode 1:    illegal_traces_ratio = 80%
Episode 100:  illegal_traces_ratio = 78%
```
→ La penalización es insuficiente o el agente no está aprendiendo adecuadamente

---

## Relación con Otras Métricas

- **`train/ep_rew_sum`**: Recompensa total del episodio
  - Debe mejorar (aumentar) conforme disminuye `illegal_traces_ratio`

- **`train/episode_steps`**: Longitud del episodio
  - Puede aumentar o disminuir según la política del agente

- **`train/explained_variance`**: Varianza explicada del modelo de valor
  - Debe aumentar (acercarse a 1.0) conforme mejora la convergencia

---

## Ejemplo: Análisis Comparativo de Penalizaciones

```python
import pandas as pd
import matplotlib.pyplot as plt

# Cargar datos de diferentes experimentos
df_low = pd.read_csv("train_trace_exp_Pension_LOW_PENALTY_*.csv")
df_med = pd.read_csv("train_trace_exp_Pension_MED_PENALTY_*.csv")
df_high = pd.read_csv("train_trace_exp_Pension_HIGH_PENALTY_*.csv")

# Agrupar por episodio
ep_low = df_low.groupby("episode")["illegal_traces_ratio"].last()
ep_med = df_med.groupby("episode")["illegal_traces_ratio"].last()
ep_high = df_high.groupby("episode")["illegal_traces_ratio"].last()

# Graficar
plt.figure(figsize=(12, 6))
plt.plot(ep_low.index, ep_low.values, label="Low Penalty", marker='o')
plt.plot(ep_med.index, ep_med.values, label="Medium Penalty", marker='s')
plt.plot(ep_high.index, ep_high.values, label="High Penalty", marker='^')
plt.xlabel("Episode")
plt.ylabel("Illegal Traces Ratio (%)")
plt.title("Convergence Analysis: Effect of Penalty Coefficient")
plt.legend()
plt.grid(alpha=0.3)
plt.show()
```

---

## Notas Técnicas

- La acción se marca como **ilegal** cuando el servidor retorna `baseMapped === -10`
- Esto sucede cuando el agente intenta ejecutar una acción que no está en las acciones válidas
- El contador se mantiene **acumulativo dentro del episodio**, reseteándose al comenzar uno nuevo
- La métrica se registra en **TensorBoard al final de cada episodio** (cuando `done=True`)
