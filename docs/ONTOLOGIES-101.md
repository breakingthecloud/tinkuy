# Ontologías 101 — Guía para principiantes

Esta guía explica qué es una ontología, por qué la usa Tinkuy, y cómo escribir
un `tokenops_ontology.yaml` correcto. No asume experiencia previa en grafos,
lógica formal o bases de datos de conocimiento.

---

## 1. ¿Qué es una ontología?

Una **ontología** es un contrato explícito sobre el significado de las cosas en
un dominio. Responde tres preguntas:

1. **¿Qué cosas existen?** → *entidades* (Client, Invoice, Product…)
2. **¿Qué se puede decir de cada cosa?** → *propiedades* (un Client tiene `id`, `status`)
3. **¿Cómo se relacionan las cosas?** → *relaciones* (un Client `HAS_BILLING_DISPUTE` Invoice)

No es magia ni una base de datos nueva. Es un **acuerdo de tipos** — como TypeScript,
pero para el mundo del negocio en lugar de para objetos de JavaScript.

> 💡 **Analogía:** TypeScript le dice a tu código qué campos puede tener un objeto.
> Una ontología le dice a tu agente de IA qué cosas, propiedades y relaciones son
> válidas en tu negocio — y qué cosas son alucinaciones.

## 2. Vocabulario mínimo (en 2 minutos)

| Término | Qué significa | Ejemplo |
|---------|---------------|---------|
| **T-Box** | El *esquema* — las reglas (qué es válido) | "Client tiene id UUID" |
| **A-Box** | Los *datos* — las instancias concretas | "el cliente con id `9f2c…`" |
| **Entidad** | Un tipo de cosa | `Client`, `Invoice` |
| **Propiedad** | Un atributo de una entidad | `status`, `amount` |
| **Relación** | Un arco dirigido entre dos entidades | `HAS_BILLING_DISPUTE` |
| **Cardinalidad** | Cuántas veces puede repetirse una relación | `1:N` = uno a muchos |
| **Instancia** | Una ocurrencia concreta de una entidad | `{ id: "9f2c…", status: "ACTIVE" }` |
| **Ontología estricta** | Solo se acepta lo declarado en el schema | una relación no declarada = error |

**La idea clave (T-Box vs A-Box):** la ontología que escribes (T-Box) es la
constitución. Los datos que produce el LLM (A-Box) deben obedecerla. El validador
de Tinkuy compara una contra la otra.

## 3. ¿Por qué usar una ontología con un LLM?

Los LLM son **probabilísticos**: pueden inventar entidades ("Teleporter"),
relaciones ("CALLS_CEO_AT_3AM"), o valores ("status: FLYING"). Si esa salida llega
a tu base de datos o a una factura, corrompes datos o pierdes dinero.

Una ontología estricta convierte esa salida libre en un **contrato validable**:

```
Salida cruda del LLM ──► validador (CPU, $0) ──► ¿cumple la ontología?
                                                     │
                                              SÍ: guardar (seguro)
                                              NO: detener, NO persistir (alucinación)
```

Ventajas frente a "pagar otro LLM para evaluar al LLM":
- **Costo cero** — es comparación de estructuras, no inferencia
- **Determinístico** — mismas reglas siempre, mismas respuestas
- **Rastreable** — cada rechazo tiene un motivo estructurado (`violations`)

## 4. Anatomía de un `tokenops_ontology.yaml`

```yaml
version: "1.1"                        # versión del formato del schema
domain: "customer_operations"         # el negocio que modelas

meta:                                 # gobernanza (opcional)
  owner: "finops-platform"
  updated_at: "2026-08-02"

ontology:
  entities:                           # ── las cosas que existen ──
    - name: "Client"
      min_instances: 1                # la respuesta DEBE traer al menos 1 Client
      properties:
        id:
          type: "UUID"                # tipo del valor
          required: true              # obligatorio en la respuesta
        status:
          type: "STRING"
          enum: ["ACTIVE", "INACTIVE", "BLOCKED"]   # solo estos valores
          required: true

  allowed_relations:                  # ── los arcos permitidos ──
    - origin: "Client"
      relation: "HAS_BILLING_DISPUTE"
      target: "Invoice"
      cardinality: "1:N"              # un Client → muchas Invoice

harness_constraints:                  # ── política financiera / enforcement ──
  enforce_json_schema: true           # aplica type/required/enum
  fail_on_unknown_relation: true      # KILL SWITCH: alucinar = detener ejecución
  strands_routing:
    default_tier: "economy"
    max_usd_budget_per_strand: 0.02   # tope de gasto por hilo en USD
```

### Tipos de propiedad disponibles

| Tipo | Qué valida | Ejemplo |
|------|-----------|---------|
| `UUID` | formato UUID v4 | `"9f2c6f5a-…"` |
| `STRING` | cualquier texto | `"ACTIVE"` |
| `FLOAT` | número decimal | `100.50` |
| `INTEGER` | número entero | `42` |
| `BOOLEAN` | `true` / `false` | `true` |
| `ARRAY` | lista | `["a","b"]` |
| `OBJECT` | objeto anidado | `{…}` |

> 💡 **Atajo:** si no necesitas `required`/`enum`, escribe solo el tipo:
> `id: "UUID"` equivale a `id: { type: "UUID" }`. Los schemas v1.0 siguen
> siendo válidos.

### Cardinalidad, explicada

| Cardinalidad | Significado | Violación cuando… |
|--------------|-------------|-------------------|
| `1:1` | una arista por par | la relación aparece 2+ veces |
| `1:N` | un origen, muchos destinos | (sin límite a nivel de schema) |
| `N:1` | muchos orígenes, un destino | (sin límite a nivel de schema) |
| `N:M` | muchos a muchos | (sin límite a nivel de schema) |

A nivel de schema (T-Box) solo `1:1` puede comprobarse con las aristas del
response. Las cardinalidades `1:N`/`N:M` sobre datos reales (cuántas facturas
tiene *este* cliente) se validan contra la **A-Box** — por ejemplo, un grafo en
Amazon Neptune. La validación en memoria es el árbitro rápido; el grafo es el
referee definitivo.

## 5. Buenas prácticas

1. **Empieza mínimo y crece.** Un schema de 3 entidades validable es mejor que
   uno de 50 entidades que nadie mantiene. La ontología evoluciona con el negocio.
2. **Usa enums para lo que es discreto.** `status`, `currency`, `tier` → enum.
   `name`, `address`, `notes` → `STRING` libre.
3. **Marca `required` solo lo que de verdad es obligatorio.** Demasiados
   `required: true` generan falsos positivos que el LLM no puede satisfacer.
4. **Nombra relaciones como verbos.** `HAS_BILLING_DISPUTE`, `BELONGS_TO`,
   `OWNS` — no `client_invoice_link`.
5. **Pon el kill switch en producción, pero empieza en modo observación.**
   Corre con `fail_on_unknown_relation: false` + el hook
   `onOntologyViolation` para ver qué rechaza el validador antes de cortar.
6. **Documenta cada entidad y relación** con `description` — es tu
   *data dictionary* y la base para futuros diagramas o integraciones a Neptune.

## 6. Flujo de trabajo recomendado

```
1. Lista las entidades del dominio        (qué cosas maneja tu negocio)
2. Lista las propiedades + sus tipos      (qué se sabe de cada cosa)
3. Marca required y enums                 (qué es obligatorio / discreto)
4. Define las relaciones permitidas       (cómo se conectan)
5. Asigna cardinalidad                    (cuántas veces)
6. Prueba con respuestas reales del LLM   (observa las violations)
7. Endurece: activa el kill switch        (fail_on_unknown_relation: true)
8. Evoluciona la versión                  (version: "1.2", changelog en meta)
```

## 7. Recursos

- Schema de ejemplo completo: [`schema/tokenops_ontology.yaml`](../schema/tokenops_ontology.yaml)
- Referencia de la referencia AWS (Step Functions + Neptune): `tinkuylabs/examples/deterministic-ontology-aws/`
- Conceptos formales (para profundizar): *RDF*, *OWL*, *SHACL* — SHACL es el
  lenguaje de shapes más cercano a este validador
