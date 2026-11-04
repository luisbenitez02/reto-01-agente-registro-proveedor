# Agente Conversacional: Registro como Proveedor
> Reto Técnico 01 · Proceso de Selección Perxia 2.0 · Periferia IT Group

Agente conversacional autónomo desarrollado en TypeScript (Node.js 20+) para automatizar el ciclo integral de registro como proveedor ante clientes corporativos en Colombia, Ecuador, Perú, Panamá y Honduras, cumpliendo estrictamente con las reglas de negocio RN1–RN5 y las especificaciones del `PRD.md`.

---

## 🌐 Enlace Público de Producción

- **URL Pública Activa**: **[https://develop-reto1.vercel.app](https://develop-reto1.vercel.app)**
- **Health Check en Vivo**: [https://develop-reto1.vercel.app/api/health](https://develop-reto1.vercel.app/api/health)
  - Respuesta: `{"ok":true,"provider":"Azure AI (Responses API)","model":"gpt-5.2","configured":true}`
- **Infraestructura**: Despliegue cloud 24/7 en **Vercel Serverless** con backend Express/TypeScript.
- **Acceso**: Directo vía HTTPS sin contraseñas ni restricciones de red o VPN.

---

## 🤖 Modelo de Lenguaje: GPT-5.2 (Azure AI Responses API)

El agente está conectado a **Azure AI Services** utilizando el modelo frontier **`gpt-5.2`** (deployment `gpt-5.2`, versión standard):
- **Endpoint**: Responses API (`https://<recurso>.services.ai.azure.com/openai/v1/responses`).
- **Autenticación**: Encabezado `api-key` inyectado mediante variables de entorno seguras (nunca expuesto al front, repositorio ni logs).
- **Razonamiento**: Máxima precisión en el seguimiento de esquemas tipados Zod, orquestación de herramientas y discernimiento de reglas de negocio por país.

---

## ☁️ Decisión de Despliegue: Vercel vs. Azure App Service

Durante el desarrollo se exploraron dos alternativas de infraestructura cloud para cumplir con la Sección 9.3 del PRD:

### 1. Problemas Encontrados con Azure App Service
- **Restricción de Cuotas de Cómputo (vCPU)**: En regiones estándar como `eastus2`, las suscripciones de Azure frecuentemente presentan cuota 0 para máquinas virtuales de App Service (`Limit (B1 VMs): 0`, `Limit (F1 VMs): 0`), bloqueando el aprovisionamiento inmediato.
- **Timeouts en Kudu / Oryx (Errores HTTP 502 / 504)**: Al desplegar en regiones con cuota disponible (`southcentralus`) sobre un plan B1, el motor de construcción Kudu/Oryx agotó los tiempos límite al compilar el runtime Node.js/TypeScript y arrancar el contenedor (`Waiting for container to start...`), generando caídas intermitentes de servicio.

### 2. Por qué Vercel Serverless
- **Aprobado en el PRD**: La sección 9.3 del PRD respalda explícitamente a Vercel como plataforma de despliegue válida.
- **Arranque en Frío Inmediato**: Las funciones Serverless arrancan en milisegundos sin depender de contenedores dedicados de App Service.
- **Sin Cuotas Bloqueantes**: Escalamiento automático y disponibilidad global 24/7 sin restricciones de vCPU.
- **Manejo de Almacenamiento Efímero**: Redirección transparente de escrituras de archivos a `/tmp/out` en serverless (`getOutDir`), preservando la inmutabilidad requerida en la nube.
- **Secretos Protegidos**: Variables de entorno (`AZURE_OPENAI_API_KEY`, etc.) administradas como secretos cifrados a nivel de proyecto.

---

## 🧪 Verificación Detallada contra `PRD.md`

### 1. Verificación Determinista de Casos (`demo.ts`)
El script `demo.ts` valida el 100% de los fixtures sin invocar modelos de lenguaje ni consumir cuotas:

```bash
cd develop-reto1
npm run demo
```

Resultados observados en la suite:
| Caso | País | Formato | Soportes y Reglas Clave | Estado para Firma | Formato Generado |
|---|---|---|---|---|---|
| **`co-industrias-delta`** | CO | Excel (`.xlsx`) | Soportes completos y vigentes. Llenado exacto de celdas según plantilla. | 🟢 **Listo** | `formulario.xlsx` |
| **`ec-corp-andina`** | EC | PDF (`.pdf`) | Falta `certificado_cumplimiento_tributario` (RN3). Aplica regla RN1 (NIT como identificador extranjero). | 🔴 **Bloqueado** | `formulario.pdf` |
| **`hn-agroexport-sula`** | HN | Excel (`.xlsx`) | `parafiscales` vencidos al 2026-08-31 (RN3). Aplica regla RN1 (RTN con NIT). | 🔴 **Bloqueado** | `formulario.xlsx` |
| **`pa-logistica-istmo`** | PA | Portal web | Formato portal no soportado directamente (P2). Genera valores listos para copiar. | 🟢 **Listo** | `valores-portal.md` |

### 2. Cumplimiento de Reglas de Negocio
- **RN1 (Identificador tributario extranjero)**: Traduce CO → NIT, EC → RUC, HN → RTN, PA → RUC. Para países no-CO, propone el NIT colombiano en `requiere_confirmacion` con la nota explícita *"identificador extranjero"*.
- **RN2 (Privacidad bancaria)**: Las cuentas y datos bancarios solo se diligencian si la plantilla los exige, y se omiten taxativamente de `borrador-correo.md` y `checklist.md`.
- **RN3 (Bloqueo de firma)**: Cualquier soporte ausente o con `vigencia_hasta` vencida marca `listo_para_firma: false` de manera innegociable.
- **RN4 (Confirmación humana obligatoria)**: `proveedor_simular_envio` rechaza la ejecución si el usuario no confirmó explícitamente en el turno previo.
- **RN5 (Trazabilidad y auditoría)**: Toda ejecución de herramientas se registra en `out/<caso>/log.jsonl` y `out/log.jsonl`.

---

## 🚀 Inicio Rápido en Local

### 1. Instalación
```bash
cd develop-reto1
npm install
```

### 2. Configuración de Variables de Entorno
Copia el archivo de ejemplo y configura tus credenciales:
```bash
cp .env.example .env
```
Contenido de `.env`:
```env
AZURE_OPENAI_ENDPOINT=https://<tu-recurso>.services.ai.azure.com/openai/v1/responses
AZURE_OPENAI_API_KEY=<tu-api-key>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5.2
PORT=3000
```

### 3. Ejecución del Servidor Local
```bash
npm run dev
```
Abre en tu navegador: **http://localhost:3000**

---

## 💬 Prompt de Prueba Recomendado (Sección 11 PRD)

En una sesión nueva de la UI web ([https://develop-reto1.vercel.app](https://develop-reto1.vercel.app)):

```text
Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles
faltan, si el paquete está listo para firma y qué soportes debo actualizar.
No envíes nada todavía.
```

**Comportamiento del Agente**:
1. Inspecciona la solicitud y ejecuta las herramientas tipadas en secuencia visible.
2. Identifica que el formato requerido es PDF.
3. Advierte que el NIT colombiano fue propuesto como RUC extranjero requiriendo confirmación (RN1).
4. Detecta que falta el `certificado_cumplimiento_tributario` y marca el paquete como **NO listo para firma** (RN3).
5. Solicita confirmación humana antes de proceder a cualquier envío (RN4).
6. Al responder "Sí, confirmar envío", el agente simula el envío y genera `ENVIO-SIMULADO.md`.

---

## 🎁 Bonus: Módulo Reutilizable (+10 Puntos)

En cumplimiento de la Sección 9.4 del PRD, se entrega la carpeta `modulo/` con componentes desacoplados:
- **`modulo/agent.md`**: Definición empaquetada con frontmatter YAML (`mode: primary`, permisos `edit: deny`, `bash: deny`) y el system prompt íntegro.
- **`modulo/tools/proveedor.ts`**: Las 5 herramientas tipadas con Zod exactamente idénticas a las del backend.
- **`modulo/skill/registro-proveedor/SKILL.md`**: Skill empaquetado con frontmatter YAML y la base de conocimiento corporativo.

---

## 📁 Estructura del Proyecto

```
develop-reto1/
├── agent/
│   └── prompt.md                         # System prompt del agente (desacoplado)
├── api/
│   └── index.ts                          # Serverless handler para Vercel
├── src/
│   ├── server.ts                         # Servidor Express y endpoints HTTP
│   ├── agent/
│   │   └── loop.ts                       # Ciclo ReAct, tope de iteraciones y confirmación
│   ├── llm/
│   │   ├── adapter.ts                    # Interfaz agnóstica de LLM
│   │   └── azure.ts                      # Adaptador para Azure AI Responses API
│   ├── tools/
│   │   └── proveedor.ts                  # 5 herramientas tipadas con Zod
│   └── knowledge/
│       └── registro-proveedor.md         # Conocimiento del negocio y reglas de país
├── web/
│   └── index.html                        # Frontend de chat con visor de tool calls y confirmación
├── modulo/                               # Bonus: módulo reutilizable (+10 pts)
│   ├── agent.md                          # Definición de agente empaquetado
│   ├── tools/proveedor.ts                # Herramientas independientes
│   └── skill/registro-proveedor/SKILL.md # Skill empaquetado
├── fixtures/                             # Fixtures empaquetados para Vercel
├── demo.ts                               # Suite determinista de herramientas
├── SOLUCION.md                           # Planteamiento técnico y rúbrica PRD
├── README.md                             # Guía de despliegue y uso
├── vercel.json                           # Configuración de despliegue Serverless
├── package.json
└── tsconfig.json
```
