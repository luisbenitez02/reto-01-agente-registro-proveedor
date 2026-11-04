# Agente Conversacional: Registro como Proveedor
> Reto Técnico 01 · Proceso de Selección Perxia 2.0 · Periferia IT Group

Agente conversacional autónomo desarrollado en TypeScript (Node.js 20+) para automatizar el ciclo integral de registro como proveedor ante clientes corporativos en Colombia, Ecuador, Perú, Panamá y Honduras.

---

## 🚀 Inicio Rápido (Local)

### 1. Requisitos Previos
- **Node.js**: v20+ (probado y validado en Node v26).
- **npm** o **bun**.

### 2. Instalación de Dependencias
```bash
cd develop-reto1
npm install
```

### 3. Configuración de Variables de Entorno
Copia el archivo de ejemplo y configura tus credenciales de Azure OpenAI:
```bash
cp .env.example .env
```
Edita `.env` con tus datos:
```env
AZURE_OPENAI_ENDPOINT=https://<tu-recurso>.openai.azure.com/
AZURE_OPENAI_API_KEY=<tu-api-key>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview
PORT=3000
```

### 4. Ejecución en un solo comando
```bash
npm run dev
```
Abre en tu navegador: **http://localhost:3000**

---

## 🧪 Verificación Determinista sin Modelo (`demo.ts`)

Para validar todas las herramientas, reglas de negocio (RN1-RN5) y generación de formatos (.xlsx, .pdf, markdown) sobre el 100% de los fixtures sin consumir API keys ni tokens:

```bash
npm run demo
```
O directamente con `tsx`:
```bash
npx tsx demo.ts
```

Esto procesa los 4 casos (`co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula`, `pa-logistica-istmo`), valida la generación de archivos en `out/`, el bloqueo de envíos sin confirmación explícita y los reportes de soportes y faltantes.

---

## 🌐 Enlace Público de Prueba

- **URL Pública Activa**: [https://514131a13d023f.lhr.life](https://514131a13d023f.lhr.life)
- **Autenticación**: Acceso directo HTTPS sin contraseña.

---

## 📁 Estructura del Proyecto

```
develop-reto1/
├── agent/
│   └── prompt.md                         # System prompt del agente
├── src/
│   ├── server.ts                         # Servidor Express y endpoints HTTP
│   ├── agent/
│   │   └── loop.ts                       # Ciclo ReAct, tope de iteraciones y confirmación
│   ├── llm/
│   │   ├── adapter.ts                    # Interfaz agnóstica de LLM
│   │   └── azure.ts                      # Adaptador para Azure OpenAI
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
├── demo.ts                               # Suite determinista de herramientas
├── SOLUCION.md                           # Planteamiento técnico y rúbrica PRD
├── README.md                             # Guía de despliegue y uso
├── package.json
└── tsconfig.json
```

---

## 📋 API Endpoints

- `POST /api/chat`: Cuerpo `{ sessionId, message }`. Responde `{ reply, toolCalls[], needsConfirmation }`.
- `GET /api/sessions/:id`: Historial de conversación y estado de confirmación de la sesión.
- `GET /api/health`: Estado del servicio y proveedor configurado sin revelar secretos.

