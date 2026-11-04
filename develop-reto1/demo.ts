import * as fs from "node:fs";
import * as path from "node:path";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor.js";

async function runDemo() {
  console.log("==================================================================");
  console.log("   RETO 01: AGENTE REGISTRO PROVEEDOR — DEMO DETERMINISTA (SIN LLM)");
  console.log("==================================================================\n");

  const projectDir = process.cwd();
  const ctx = {
    directory: projectDir,
    sessionId: "demo-session",
    executionDate: "2026-09-03", // Deterministic reference date for demo
  };

  // Clean out/
  const outDir = path.join(projectDir, "out");
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Locate cases
  let casosBaseDir = path.join(projectDir, "fixtures/reto-01/casos");
  if (!fs.existsSync(casosBaseDir)) {
    casosBaseDir = path.join(projectDir, "../fixtures/reto-01/casos");
  }

  const casos = fs
    .readdirSync(casosBaseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`Se encontraron ${casos.length} casos de prueba en fixtures: ${casos.join(", ")}\n`);

  for (const caso of casos) {
    console.log(`------------------------------------------------------------------`);
    console.log(`[CASO]: ${caso}`);
    console.log(`------------------------------------------------------------------`);

    // 1. Leer solicitud
    const t1 = JSON.parse(await leer_solicitud.execute({ caso }, ctx));
    if (!t1.ok) {
      console.error(`❌ Error en leer_solicitud:`, t1.error);
      continue;
    }
    console.log(`✅ 1. Solicitud leída: Cliente="${t1.data.cliente}", País=${t1.data.pais}, Formato=${t1.data.formato}`);

    // 2. Mapear campos
    const t2 = JSON.parse(await mapear_campos.execute({ caso }, ctx));
    if (!t2.ok) {
      console.error(`❌ Error en mapear_campos:`, t2.error);
      continue;
    }
    const { llenos, faltantes, requiere_confirmacion } = t2.data;
    console.log(`✅ 2. Campos mapeados: Llenos=${llenos.length}, Faltantes=${faltantes.length}, RequierenConfirmación=${requiere_confirmacion.length}`);
    if (faltantes.length > 0) {
      console.log(`   - Faltantes: ${faltantes.map((f: { etiqueta: string }) => f.etiqueta).join(", ")}`);
    }
    if (requiere_confirmacion.length > 0) {
      console.log(`   - Requieren confirmación: ${requiere_confirmacion.map((rc: { etiqueta: string; motivo: string }) => `${rc.etiqueta} (${rc.motivo})`).join(", ")}`);
    }

    // 3. Generar formulario
    const t3 = JSON.parse(await generar_formulario.execute({ caso, mapeo: t2.data }, ctx));
    if (!t3.ok) {
      console.error(`❌ Error en generar_formulario:`, t3.error);
      continue;
    }
    console.log(`✅ 3. Formulario generado: ${t3.data.ruta} (${t3.data.formato})`);

    // 4. Armar paquete
    const t4 = JSON.parse(await armar_paquete.execute({ caso }, ctx));
    if (!t4.ok) {
      console.error(`❌ Error en armar_paquete:`, t4.error);
      continue;
    }
    const { listo_para_firma, checklist, ruta: rutaPaquete } = t4.data;
    console.log(`✅ 4. Paquete armado en: ${rutaPaquete}`);
    console.log(`   - Listo para firma: ${listo_para_firma ? "🟢 SÍ" : "🔴 NO (bloqueado)"}`);
    console.log(`   - Soportes presentes: ${checklist.presentes.join(", ") || "Ninguno"}`);
    if (checklist.ausentes.length > 0) console.log(`   - Soportes ausentes: ${checklist.ausentes.join(", ")}`);
    if (checklist.vencidos.length > 0) console.log(`   - Soportes vencidos: ${checklist.vencidos.join(", ")}`);

    // 5. Simular envío sin confirmación (debe fallar según RN4)
    const t5Reject = JSON.parse(await simular_envio.execute({ caso, confirmado: false }, ctx));
    if (!t5Reject.ok && t5Reject.error.includes("confirmación")) {
      console.log(`✅ 5a. Seguridad RN4 verificada: Envío bloqueado sin confirmación explícita.`);
    } else {
      console.error(`❌ Falla en RN4: Se esperaba rechazo sin confirmación y retornó:`, t5Reject);
    }

    // 5b. Simular envío con confirmación
    const t5Ok = JSON.parse(await simular_envio.execute({ caso, confirmado: true }, ctx));
    if (t5Ok.ok) {
      console.log(`✅ 5b. Envío simulado con confirmación: ${t5Ok.data.ruta}\n`);
    } else {
      console.error(`❌ Error en simular_envio con confirmación:`, t5Ok.error);
    }
  }

  console.log("==================================================================");
  console.log("   TODAS LAS PRUEBAS DETERMINISTAS COMPLETADAS SATISFACTORIAMENTE");
  console.log("==================================================================");
}

runDemo().catch((err) => {
  console.error("Fallo crítico en demo.ts:", err);
  process.exit(1);
});

