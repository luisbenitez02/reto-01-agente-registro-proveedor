# Feature: Agente Registro de Proveedor
Implementación del reto técnico según PRD.md para automatización de registro de proveedores.

## Specs
- S1: "Paso 1 — Fundamentos y Herramientas P0 (demo.ts): Inicializar package.json, TypeScript y dependencias base. Implementar src/tools/proveedor.ts con Zod (leer_solicitud, mapear_campos, generar_formulario, armar_paquete, simular_envio). Crear y validar demo.ts contra los 4 casos de fixtures/reto-01/casos/ sin LLM."
- S2: "Paso 2 — Adaptador Azure OpenAI y Ciclo del Agente: Crear agent/prompt.md y src/knowledge/registro-proveedor.md. Implementar src/llm/azure.ts y el loop del agente (ejecución de tools, tope de iteraciones, confirmación humana y log)."
- S3: "Paso 3 — API HTTP y UI de Chat: Crear src/server.ts con /api/chat, /api/sessions/:id y /api/health. Construir interfaz en web/ con indicador visual de tool calls y banner de confirmación."
- S4: "Paso 4 — Documentación y Bonus (+10 pts): Generar modulo/ reutilizable (agent.md, tools/proveedor.ts, skill/registro-proveedor/SKILL.md). Redactar SOLUCION.md cubriendo los 10 puntos de la rúbrica y README.md."
- S5: "Paso 5 — Exposición del link público y prueba final: Levantar túnel y validar con el prompt de prueba oficial (ec-corp-andina)."

## Tasks
- [x] T1 (S1): Setup de proyecto, dependencias y herramientas tipadas en `src/tools/proveedor.ts` con verificación determinista en `demo.ts` | route: direct-inline | commit: bcab8ba
- [x] T2 (S2): Adaptador Azure OpenAI, `agent/prompt.md`, `src/knowledge/registro-proveedor.md` y ciclo del agente con control de confirmación | route: direct-inline | commit: fc23f34
- [x] T3 (S3): Servidor Express (`src/server.ts`) y frontend de chat (`web/`) con visualización de tool calls y confirmación humana | route: direct-inline | commit: 18ee1b8
- [x] T4 (S4): Documentación completa (`SOLUCION.md`, `README.md`) y empaquetado del módulo reutilizable (`modulo/`) | route: direct-inline | commit: 47af738
- [ ] T5 (S5): Configuración de exposición pública y validación e2e con el caso `ec-corp-andina` | route: direct-inline | commit: pending

## Log
- L1: "Necesito implementar este reto tecnico siguiendo las instrucciones del archivo PRD.md y cumpliendo todas las pruebas y fixtures. Te proveere los recursos de azure y API key necesarias para implementar. Vamos a ir paso a paso, lo primero que quiero es definir el step by step, los servicios que necesitamos (un enfoque simple, como una PoC) y. partir de alli ir implementando por partes. Tengo 2 horas para finalizar esta prueba"
- L2: "Arranquemos"

