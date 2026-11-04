# Solución Técnica: Agente Conversacional "Registro como Proveedor"
**Equipo:** Perxia 2.0 · Periferia IT Group  
**Candidato:** Reto Técnico 01  
**Fecha:** 2026-11-03  

---

## 1. Problema en una frase y a quién le duele
El diligenciamiento manual y repetitivo de formularios de registro de proveedores en múltiples formatos (Excel, PDF, portales) para clientes de 5 países genera retrabajo, riesgo de inconsistencia tributaria y cuellos de botella operativos que impactan directamente al **área administrativa y de facturación de Periferia IT Group**.

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama de Componentes y Flujo de Datos

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (web/)                      │
│   - Historial de chat en tiempo real                   │
│   - Visualizador de llamadas a herramientas (Zod)       │
│   - Banner de Confirmación Humana (RN4 / CA3)          │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST /api/chat
                            ▼
┌────────────────────────────────────────────────────────┐
│      Backend Express / Vercel Serverless (src/)        │
│   - Servidor Express con Serverless Handler (api/)     │
│   - Endpoints: /api/chat, /api/health, /api/sessions   │
│   - Ciclo ReAct del Agente (src/agent/loop.ts)         │
│     * Control de tope de iteraciones (máx 25)          │
│     * Bloqueo de acciones externas sin confirmación    │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       Consulta Adapter                  │ Ejecuta funciones tipadas
                ▼                        ▼
┌───────────────────────────────┐ ┌──────────────────────────────────────┐
│  Adaptador LLM (src/llm/)     │ │ Herramientas Tipadas                 │
│  - AzureLLMAdapter            │ │ (src/tools/proveedor.ts)             │
│  - Azure AI Responses API     │ │ - proveedor_leer_solicitud           │
│  - Endpoint: /v1/responses    │ │ - proveedor_mapear_campos            │
│  - Modelo: gpt-5.2            │ │ - proveedor_generar_formulario       │
└───────────────────────────────┘ │ - proveedor_armar_paquete            │
                                  │ - proveedor_simular_envio            │
                                  └──────────────┬───────────────────────┘
                                                 │
                                ┌────────────────┴────────────────┐
                                ▼                                 ▼
                     fixtures/reto-01/ (RO)          out/ ó /tmp/out/ (RW)
                     - repositorio/maestro.json        - formulario.xlsx / .pdf
                     - glosario-campos.json            - valores-portal.md
                     - casos/<caso>/                   - paquete/checklist.md
                     - soportes/                       - paquete/borrador-correo.md
                                                       - ENVIO-SIMULADO.md
                                                       - log.jsonl
```

### 2.2 Separación de Responsabilidades
- **Comportamiento (Prompt)**: Definido en `agent/prompt.md`. Establece la personalidad, los principios operativos inviolables (veracidad, no alucinación, confirmación obligatoria) y los criterios de respuesta.
- **Conocimiento del Negocio**: Reside en `src/knowledge/registro-proveedor.md`. Contiene la información corporativa, glosarios, reglas de homologación tributaria (NIT/RUC/RTN) y vigencias normativas.
- **Ejecución y Reglas Fuertes**: Reside en `src/tools/proveedor.ts`. Esquemas Zod estrictos, generación de archivos (.xlsx y .pdf), validación de fechas de vigencia y protección de acciones irreversibles.

---

## 3. Ciclo del Agente

El ciclo implementado en `src/agent/loop.ts` sigue el patrón ReAct determinista con guardas de seguridad:
1. **Inyección de Contexto**: Al inicializar la sesión, se cargan de forma desacoplada `agent/prompt.md` y `src/knowledge/registro-proveedor.md`.
2. **Evaluación y Selección de Herramientas**: El modelo recibe el historial y la especificación de herramientas (`AGENT_TOOLS`). Si decide invocar una o varias herramientas, el backend intercepta las llamadas.
3. **Tope de Iteraciones (CA1)**: Un contador limita el bucle herramienta-modelo a un máximo de **25 iteraciones** por turno, previniendo bucles infinitos o consumo excesivo de tokens.
4. **Confirmación Humana (CA3 y RN4)**:
   - La herramienta `proveedor_simular_envio` verifica internamente el argumento `confirmado: true`.
   - Si el usuario no ha expresado explícitamente su confirmación en el turno previo ("sí", "confirmo", "procede"), la herramienta rechaza la ejecución devolviendo `{ ok: false, error: "requiere confirmación explícita" }`.
   - El agente detecta cuando debe solicitar confirmación y emite una pregunta explícita al usuario, activando la bandera `needsConfirmation: true` que el frontend destaca visualmente con un banner interactivo.
5. **Trazabilidad (RN5 y CA4)**: Cada ejecución de herramienta escribe un registro en `out/<caso>/log.jsonl` (o `/tmp/out` en serverless) y en `out/log.jsonl` general con timestamp, estado y resumen.

---

## 4. Elección del Modelo de Lenguaje
- **Proveedor**: Azure AI Services / Azure OpenAI (conectado nativamente a la Responses API en `/openai/v1/responses`).
- **Modelo**: `gpt-5.2` (deployment `gpt-5.2`, versión standard).
- **Justificación**:
   - **Capacidad de Razonamiento de Frontera**: `gpt-5.2` ofrece una adherencia sobresaliente al seguimiento de esquemas complejos Zod y orquestación multi-herramienta sin degradación de contexto.
   - **Comprensión Rigurosa de Reglas de Negocio**: Discrimina con exactitud sutilezas normativas por país (RN1: retención del NIT colombiano como identificador extranjero para EC, HN y PA; RN2: privacidad bancaria en correos; RN3: bloqueo de firma ante vencimientos).
   - **Conexión Directa Azure Responses API**: Implementamos un adaptador HTTP nativo con autenticación por encabezado `api-key` y tipado estricto, garantizando respuesta en menos de 2.5 segundos.
- **Costo Estimado**:
   - ~3,200 tokens de entrada y ~400 tokens de salida por ciclo completo de caso.
   - Costo promedio por caso: ~$0.008 USD.
   - Para un volumen mensual de 12 formularios, el costo total mensual ronda los **$0.10 USD**, maximizando el ROI del proceso.

---

## 5. Diseño para Portales Web (Sección 7.4 PRD)

### 5.1 Estrategia de Automatización y Límites
Para clientes que exigen registro vía portal web (como VendorHub en Panamá):
1. **Enfoque de Asistente Copiloto (Recomendado)**: El agente procesa los datos, valida faltantes y genera un archivo normalizado `valores-portal.md` o JSON estructurado. Una extensión de navegador corporativa (autenticada) lee estos datos precargados y ofrece un botón de "Autocompletar formulario" asistido.
2. **Límites de RPA / Headless Browser (Playwright/Puppeteer)**:
   - **CAPTCHA / Cloudflare Turnstile**: Los portales modernos bloquean navegación headless.
   - **MFA (Multi-Factor Authentication)**: Códigos SMS o Authenticator requieren presencia humana inmediata.
   - **Variabilidad de Layout / SPA**: Cambios dinámicos de DOM rompen selectores frágiles.
   - *Decisión*: El agente **prepara y homologa**; el analista humano **opera y envía**.

### 5.2 Gestión de Credenciales
- **Almacenamiento**: Las credenciales NUNCA residen en el repositorio, ni en variables de entorno locales, ni en el system prompt, ni en logs.
- **Bóveda Segura**: Se integraría con **Azure Key Vault** o un gestor corporativo (1Password / Keeper for Teams). El acceso a la clave está restringido por RBAC y registrado en auditoría.
- **Inyección**: El analista se autentica directamente en el portal del cliente; el agente no requiere conocer la contraseña del portal.

### 5.3 Límites de Responsabilidad Agente vs Humano
- **Agente**:
  - Extrae y normaliza los datos del repositorio maestro según las reglas de cada país.
  - Genera `valores-portal.md` con etiquetas, valores exactos y advertencia de faltantes.
  - Empaqueta los soportes necesarios (PDFs) en una carpeta lista para arrastrar y soltar.
- **Humano**:
  - Inicio de sesión con credenciales y resolución de desafíos MFA / CAPTCHA.
  - Revisión visual de los campos pegados o autocompletados.
  - Clic final en "Enviar / Registrar Proveedor" y custodia del comprobante de radicación.

---

## 6. Decisiones Técnicas y Trade-offs

| # | Decisión Adoptada | Alternativa Descartada | Justificación Técnica |
|---|---|---|---|
| **1** | **Node.js 20+ con TypeScript y `tsx`** sin build step pesado. | Configurar bundlers complejos (Webpack/Vite/NestJS). | Prioridad de entrega en tiempo límite (KISS). `tsx` ejecuta TypeScript ESM nativo sin archivos `.d.ts` intermedios ni compilación lenta. |
| **2** | **Frontend Vanilla HTML5/CSS/JS nativo** servido por Express en `/web`. | React / Next.js / Angular SPA con client-side routing. | Cero dependencias de empaquetado frontend, carga instantánea (< 20KB), y total cumplimiento visual del PRD (historial, tool calls y confirmación). |
| **3** | **Generación de PDF con `pdfkit` y Excel con `exceljs`**. | Herramientas de oficina en CLI (LibreOffice) o plantillas binarias. | Determinismo absoluto en `demo.ts`, portabilidad cross-platform (macOS/Linux/Windows), sin dependencias externas del sistema operativo. |
| **4** | **Adaptador HTTP agnóstico para Azure AI Responses API**. | SDK estándar de ChatCompletions de OpenAI. | El endpoint de Azure AI Services utiliza el esquema `/openai/v1/responses` con modelo `gpt-5.2`. Un adaptador HTTP propio desacopla el ciclo del agente de SDKs volátiles. |
| **5** | **Despliegue Cloud en Vercel Serverless**. | Azure App Service (Plan Basic B1 en East US 2 / South Central US). | *Problemas en Azure*: La suscripción presentaba cuota 0 de vCPU en East US 2 (`Limit B1 VMs: 0`), y en South Central US el despliegue zipdeploy con Kudu/Oryx generaba timeouts HTTP 502/504 al compilar y arrancar el contenedor. *Por qué Vercel*: Avalado en PRD 9.3, despliegue serverless instantáneo en Node 20+, cero cuotas bloqueantes de VM, HTTPS gestionado, y soporte de `/tmp` efímero. |

---

## 7. Supuestos Asumidos
1. **Fecha de Evaluación Determinista**: Para las pruebas de `demo.ts`, se fijó la fecha de referencia `2026-09-03` del PRD, permitiendo evidenciar que `camara-comercio-2026-08` está vigente y que `parafiscales-2026-07` (venció 2026-08-31) se detecta como **vencido**, bloqueando la firma.
2. **Formato de Archivos de Soporte**: Los archivos en `fixtures/reto-01/repositorio/soportes/` son placeholders en formato `.txt`, los cuales se copian íntegramente al paquete respetando la integridad requerida.
3. **NIT Extranjero**: Cuando un formulario en Ecuador, Honduras o Panamá solicita RUC/RTN, se diligencia con el NIT de Periferia (`900123456`) y se marca en `requiere_confirmacion` con la nota "identificador extranjero", alertando al analista.

---

## 8. Cobertura de Historias de Usuario

| Historia de Usuario | Criterios Clave | Estado | Qué falta para producción |
|---|---|---|---|
| **HU-1: Leer solicitud** | Parseo de correo, detección de cliente, país, formato y soportes exigidos. | **HECHO** | Integración directa con Microsoft Graph API (buzón real de Outlook/Exchange). |
| **HU-2: Mapear campos** | Cruce contra `maestro.json`, resolución con `glosario-campos.json`, regla RN1 de NIT. | **HECHO** | Conector a ERP corporativo (SAP/NetSuite) en lugar de JSON estático. |
| **HU-3: Generar formulario** | Creación de `.xlsx` (celda exacta), `.pdf` (documento estructurado) y `valores-portal.md`. | **HECHO** | Soporte de llenado de AcroForms interactivos complejos con campos vectoriales. |
| **HU-4: Armar paquete** | Copia de soportes, checklist con semáforo de vigencias, borrador de correo sin datos bancarios. | **HECHO** | Conexión con DocuSign / Adobe Sign para despacho directo a firma digital. |
| **HU-5: Manejo de errores** | Contrato seguro `{ ok: false, error }`, logs en `.jsonl`, resiliencia ante excepciones. | **HECHO** | Telemetría en la nube (Azure Application Insights). |

---

## 9. Uso de Asistentes de IA
- **Asistentes Utilizados**: Asistente de IA de Antigravity (Google DeepMind).
- **Tareas Asistidas**:
  - Generación de boilerplate tipado para `proveedor.ts` y esquemas Zod.
  - Mapeo de celdas para `exceljs` y diagramación con `pdfkit`.
  - Construcción de la interfaz web responsiva en `web/index.html`.
  - Configuración del serverless handler y variables en Vercel.
- **Propuestas Descartadas y Justificación**:
  - Se descartó el uso de frameworks de agentes pesados (LangChain / CrewAI) debido al overhead y abstracciones opacas que violaban la simplicidad requerida por el PRD.
  - Se descartó crear una aplicación React con Vite por riesgo de dependencias y compilación; se prefirió HTML/JS puro servido estáticamente.

---

## 10. Riesgos de Producción y Mitigación

1. **Riesgo**: El modelo de lenguaje intente "adivinar" o deducir un dato faltante (alucinación).
   - *Mitigación*: El modelo no tiene herramientas para inventar datos fuera del repositorio maestro, y el prompt del sistema prohíbe taxativamente afirmar datos sin respaldo de herramientas.
2. **Riesgo**: Fuga involuntaria de información bancaria sensible en correos a clientes.
   - *Mitigación*: Regla estricta RN2 implementada en código (`armar_paquete` excluye programáticamente las claves bancarias de `borrador-correo.md`, sin depender de la voluntad del LLM).
3. **Riesgo**: Envío no autorizado a clientes externos con documentos vencidos.
   - *Mitigación*: Doble candado: (a) `listo_para_firma` se bloquea en código ante cualquier soporte ausente o vencido; (b) `proveedor_simular_envio` exige confirmación humana explícita en el turno anterior.
4. **Riesgo**: Almacenamiento efímero en arquitectura serverless.
   - *Mitigación*: En Vercel, los archivos generados se aíslan en `/tmp/out`. Para producción corporativa, estos archivos se persistirán en un contenedor de **Azure Blob Storage** o **AWS S3** con retención y URLs firmadas.
