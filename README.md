# Reto Técnico 01 — Agente Conversacional "Registro como Proveedor"
> Perxia 2.0 · Periferia IT Group

Agente conversacional autónomo desarrollado en TypeScript (Node.js 20+) para automatizar el ciclo integral de registro como proveedor ante clientes corporativos en Colombia, Ecuador, Perú, Panamá y Honduras.

El desarrollo completo y sus componentes se encuentran en el directorio [`develop-reto1/`](./develop-reto1/).

---

## 🌐 Enlace Público de Producción

- **Aplicación Web en Vivo**: **[https://develop-reto1.vercel.app](https://develop-reto1.vercel.app)**
- **Health Check**: [https://develop-reto1.vercel.app/api/health](https://develop-reto1.vercel.app/api/health)
  - Respuesta: `{"ok":true,"provider":"Azure AI (Responses API)","model":"gpt-5.2","configured":true}`
- **Infraestructura**: Despliegue cloud 24/7 en **Vercel Serverless** con backend Express y frontend interactivo.
- **Modelo de Lenguaje**: **`gpt-5.2`** (Azure AI Services via Responses API `/openai/v1/responses`).
- **Decisión Cloud**: Se seleccionó Vercel Serverless (avalado en PRD 9.3) tras descartar Azure App Service debido a cuotas de 0 vCPU en East US 2 (`Limit B1 VMs: 0`) y timeouts de construcción Kudu/Oryx (502/504) en planes básicos.

---

## 🚀 Inicio Rápido

### 1. Verificación Determinista sin Modelo (`demo.ts`)
Ejecuta el 100% de los fixtures deterministas y valida las reglas RN1–RN5 sin consumir API keys:
```bash
cd develop-reto1
npm install
npm run demo
```

### 2. Ejecución Local con Servidor y Chat Web
```bash
cd develop-reto1
npm run dev
# Abre http://localhost:3000
```

---

## 📋 Resumen de Cumplimiento de Casos y Fixtures

| Caso | País | Formato Solicitado | Reglas Evaluadas | Estado de Firma | Salida Generada |
|---|---|---|---|---|---|
| **`co-industrias-delta`** | CO | Excel (`.xlsx`) | Soportes completos y vigentes | 🟢 Listo | `formulario.xlsx` |
| **`ec-corp-andina`** | EC | PDF (`.pdf`) | Falta cumplimiento tributario (RN3) · NIT extranjero (RN1) | 🔴 Bloqueado | `formulario.pdf` |
| **`hn-agroexport-sula`** | HN | Excel (`.xlsx`) | Parafiscales vencidos (RN3) · RTN extranjero (RN1) | 🔴 Bloqueado | `formulario.xlsx` |
| **`pa-logistica-istmo`** | PA | Portal web | Formato portal no soportado directamente (P2) | 🟢 Listo | `valores-portal.md` |

---

## 📚 Documentación del Reto

Para revisar en detalle la solución técnica y los requerimientos de la rúbrica:
- **[develop-reto1/SOLUCION.md](./develop-reto1/SOLUCION.md)**: 10 puntos obligatorios del PRD (arquitectura, ciclo ReAct, modelo gpt-5.2, portales web, trade-offs Vercel vs App Service, supuestos, cobertura HU, uso de IA y riesgos).
- **[develop-reto1/README.md](./develop-reto1/README.md)**: Guía detallada de instalación, configuración, API REST y bonus empaquetado (`modulo/`).
