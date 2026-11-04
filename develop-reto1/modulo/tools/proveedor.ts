import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export interface ToolContext {
  directory: string;
  sessionId?: string;
  executionDate?: string; // ISO date string YYYY-MM-DD
}

// Helpers for paths and safe reading
function resolvePath(ctx: ToolContext, relativePath: string): string {
  // If the directory has a fixtures symlink or folder, use it
  return path.resolve(ctx.directory, relativePath);
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function logToolExecution(
  ctx: ToolContext,
  caso: string,
  herramienta: string,
  ok: boolean,
  resumen: string
): void {
  try {
    const ts = new Date().toISOString();
    const logEntry = JSON.stringify({ ts, herramienta, ok, resumen }) + "\n";
    
    // Case specific log
    const caseLogDir = path.resolve(ctx.directory, "out", caso);
    ensureDir(caseLogDir);
    fs.appendFileSync(path.join(caseLogDir, "log.jsonl"), logEntry, "utf-8");

    // General log
    const generalLogDir = path.resolve(ctx.directory, "out");
    ensureDir(generalLogDir);
    fs.appendFileSync(path.join(generalLogDir, "log.jsonl"), logEntry, "utf-8");
  } catch (err) {
    console.error("Error writing log.jsonl:", err);
  }
}

// Nested property getter e.g. "contacto_comercial.email"
function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Case helper to load caso files
function getCaseDir(ctx: ToolContext, caso: string): string {
  const directPath = path.resolve(ctx.directory, "fixtures/reto-01/casos", caso);
  if (fs.existsSync(directPath)) return directPath;
  const parentPath = path.resolve(ctx.directory, "../fixtures/reto-01/casos", caso);
  if (fs.existsSync(parentPath)) return parentPath;
  return directPath;
}

function getRepoDir(ctx: ToolContext): string {
  const directPath = path.resolve(ctx.directory, "fixtures/reto-01");
  if (fs.existsSync(directPath)) return directPath;
  const parentPath = path.resolve(ctx.directory, "../fixtures/reto-01");
  if (fs.existsSync(parentPath)) return parentPath;
  return directPath;
}

// --- TOOL 1: leer_solicitud ---
export const leer_solicitud = {
  description: "Lee la solicitud de registro de un cliente, sus campos solicitados, país, formato y soportes exigidos.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/ (ej: 'ec-corp-andina')"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    try {
      const caseDir = getCaseDir(ctx, args.caso);
      const solicitudPath = path.join(caseDir, "solicitud.json");
      const solicitud = safeReadJson<{
        id: string;
        de: string;
        para: string;
        asunto: string;
        fecha: string;
        pais: string;
        cliente: string;
        formato: "xlsx" | "pdf" | "portal";
        cuerpo: string;
        adjuntos: string[];
      }>(solicitudPath);

      if (!solicitud) {
        const err = `No se encontró la solicitud para el caso '${args.caso}' en ${solicitudPath}`;
        logToolExecution(ctx, args.caso, "proveedor_leer_solicitud", false, err);
        return JSON.stringify({ ok: false, error: err });
      }

      // Read plantilla according to format
      let campos: Array<string | { etiqueta: string; [key: string]: unknown }> = [];
      const plantillaCeldasPath = path.join(caseDir, "plantilla-celdas.json");
      const plantillaCamposPath = path.join(caseDir, "plantilla-campos.json");

      if (fs.existsSync(plantillaCeldasPath)) {
        const celdas = safeReadJson<Array<{ hoja: string; celda_etiqueta: string; etiqueta: string; celda_valor: string }>>(plantillaCeldasPath);
        if (celdas) campos = celdas;
      } else if (fs.existsSync(plantillaCamposPath)) {
        const camposList = safeReadJson<Array<{ etiqueta: string; obligatorio: boolean }>>(plantillaCamposPath);
        if (camposList) campos = camposList;
      }

      // Read soportes exigidos
      const soportesPath = path.join(caseDir, "soportes-exigidos.json");
      const soportes = safeReadJson<string[]>(soportesPath) || [];

      const resultData = {
        caso: args.caso,
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        fecha: solicitud.fecha,
        formato: solicitud.formato,
        campos,
        soportes,
      };

      logToolExecution(ctx, args.caso, "proveedor_leer_solicitud", true, `Leída solicitud de ${solicitud.cliente} (${solicitud.formato})`);
      return JSON.stringify({ ok: true, data: resultData });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToolExecution(ctx, args.caso, "proveedor_leer_solicitud", false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

// --- TOOL 2: mapear_campos ---
export const mapear_campos = {
  description: "Cruza cada campo solicitado con el repositorio maestro de Periferia, determinando campos llenos, faltantes y que requieren confirmación.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    campos: z.array(z.string()).optional().describe("Lista opcional de nombres de etiquetas a mapear. Si se omite, se toman de la plantilla del caso."),
  },
  async execute(args: { caso: string; campos?: string[] }, ctx: ToolContext): Promise<string> {
    try {
      const caseDir = getCaseDir(ctx, args.caso);
      const repoDir = getRepoDir(ctx);

      const solicitud = safeReadJson<{ pais: string; cliente: string; formato: string }>(path.join(caseDir, "solicitud.json"));
      if (!solicitud) {
        return JSON.stringify({ ok: false, error: `Caso '${args.caso}' no existe.` });
      }

      const maestro = safeReadJson<Record<string, unknown>>(path.join(repoDir, "repositorio/maestro.json"));
      const glosario = safeReadJson<Record<string, string>>(path.join(repoDir, "glosario-campos.json"));

      if (!maestro || !glosario) {
        return JSON.stringify({ ok: false, error: "Repositorio maestro o glosario de campos no disponible." });
      }

      // Determine fields to map
      let rawFields: Array<string | { etiqueta: string; obligatorio?: boolean }> = [];
      if (args.campos && args.campos.length > 0) {
        rawFields = args.campos;
      } else {
        const celdas = safeReadJson<Array<{ etiqueta: string }>>(path.join(caseDir, "plantilla-celdas.json"));
        const campos = safeReadJson<Array<{ etiqueta: string; obligatorio?: boolean }>>(path.join(caseDir, "plantilla-campos.json"));
        if (celdas) rawFields = celdas;
        else if (campos) rawFields = campos;
      }

      const llenos: Array<{ etiqueta: string; valor: unknown; ruta_maestro: string }> = [];
      const faltantes: Array<{ etiqueta: string; obligatorio?: boolean }> = [];
      const requiere_confirmacion: Array<{
        etiqueta: string;
        valor: unknown;
        ruta_maestro?: string;
        motivo: string;
        nota: string;
      }> = [];

      // Tax ID mapping dictionary per country (RN1)
      const taxIdLabels = ["nit", "ruc", "rtn", "identificación tributaria", "identificacion tributaria", "número de identificación fiscal", "numero de identificacion fiscal"];

      for (const item of rawFields) {
        const etiqueta = typeof item === "string" ? item : item.etiqueta;
        const obligatorio = typeof item === "object" ? item.obligatorio : undefined;

        const etiquetaNormalized = etiqueta.trim();
        const rutaMaestro = glosario[etiquetaNormalized];

        if (!rutaMaestro) {
          faltantes.push({ etiqueta, obligatorio });
          continue;
        }

        const valor = getNestedValue(maestro, rutaMaestro);
        if (valor === undefined || valor === null) {
          faltantes.push({ etiqueta, obligatorio });
          continue;
        }

        // Apply RN1: Foreign Tax ID rule
        const isTaxId = taxIdLabels.includes(etiquetaNormalized.toLowerCase()) || rutaMaestro === "nit";
        if (isTaxId && solicitud.pais !== "CO") {
          requiere_confirmacion.push({
            etiqueta,
            valor,
            ruta_maestro: rutaMaestro,
            motivo: "identificador extranjero",
            nota: `Periferia solo tiene NIT colombiano (${valor}). Para ${solicitud.pais} se requiere confirmación para usar este NIT como identificador extranjero.`,
          });
        } else {
          llenos.push({
            etiqueta,
            valor,
            ruta_maestro: rutaMaestro,
          });
        }
      }

      const resultData = {
        caso: args.caso,
        llenos,
        faltantes,
        requiere_confirmacion,
      };

      logToolExecution(
        ctx,
        args.caso,
        "proveedor_mapear_campos",
        true,
        `Mapeo completado: ${llenos.length} llenos, ${faltantes.length} faltantes, ${requiere_confirmacion.length} requieren confirmación`
      );

      return JSON.stringify({ ok: true, data: resultData });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToolExecution(ctx, args.caso, "proveedor_mapear_campos", false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

// --- TOOL 3: generar_formulario ---
export const generar_formulario = {
  description: "Genera el formulario en el formato solicitado (Excel .xlsx, PDF .pdf o valores Markdown para portal).",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    mapeo: z.record(z.any()).optional().describe("Resultado opcional de proveedor_mapear_campos. Si se omite, se calcula automáticamente."),
  },
  async execute(args: { caso: string; mapeo?: Record<string, any> }, ctx: ToolContext): Promise<string> {
    try {
      const caseDir = getCaseDir(ctx, args.caso);
      const solicitud = safeReadJson<{ cliente: string; pais: string; formato: "xlsx" | "pdf" | "portal" }>(
        path.join(caseDir, "solicitud.json")
      );

      if (!solicitud) {
        return JSON.stringify({ ok: false, error: `Caso '${args.caso}' no existe.` });
      }

      // If mapeo is not provided, run mapping internally
      let mappingData = args.mapeo;
      if (!mappingData || !mappingData.llenos) {
        const mappingRes = JSON.parse(await mapear_campos.execute({ caso: args.caso }, ctx));
        if (!mappingRes.ok) return JSON.stringify(mappingRes);
        mappingData = mappingRes.data;
      }

      if (!mappingData) {
        return JSON.stringify({ ok: false, error: "No se pudo obtener datos de mapeo." });
      }

      // Map from etiqueta -> string value (combining llenos and confirmed tax id)
      const valueMap = new Map<string, string>();
      for (const item of (mappingData.llenos || [])) {
        valueMap.set(item.etiqueta.trim(), String(item.valor));
      }
      for (const item of (mappingData.requiere_confirmacion || [])) {
        valueMap.set(item.etiqueta.trim(), String(item.valor));
      }

      const outCaseDir = path.resolve(ctx.directory, "out", args.caso);
      ensureDir(outCaseDir);

      if (solicitud.formato === "xlsx") {
        // --- P0: EXCEL GENERATION ---
        const plantillaPath = path.join(caseDir, "plantilla-celdas.json");
        const celdas = safeReadJson<Array<{ hoja: string; celda_etiqueta: string; etiqueta: string; celda_valor: string }>>(plantillaPath);

        if (!celdas) {
          return JSON.stringify({ ok: false, error: "No se encontró plantilla-celdas.json para caso xlsx" });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Periferia IT Group - Agente";
        workbook.created = new Date();

        for (const item of celdas) {
          let sheet = workbook.getWorksheet(item.hoja);
          if (!sheet) {
            sheet = workbook.addWorksheet(item.hoja);
          }
          sheet.getCell(item.celda_etiqueta).value = item.etiqueta;
          const val = valueMap.get(item.etiqueta.trim()) ?? "";
          sheet.getCell(item.celda_valor).value = val;
        }

        const outXlsxPath = path.join(outCaseDir, "formulario.xlsx");
        await workbook.xlsx.writeFile(outXlsxPath);

        logToolExecution(ctx, args.caso, "proveedor_generar_formulario", true, `Generado ${outXlsxPath}`);
        return JSON.stringify({
          ok: true,
          data: {
            ruta: path.relative(ctx.directory, outXlsxPath),
            formato: "xlsx",
          },
        });
      } else if (solicitud.formato === "pdf") {
        // --- P1: PDF GENERATION ---
        const plantillaPath = path.join(caseDir, "plantilla-campos.json");
        const campos = safeReadJson<Array<{ etiqueta: string; obligatorio: boolean }>>(plantillaPath);

        if (!campos) {
          return JSON.stringify({ ok: false, error: "No se encontró plantilla-campos.json para caso pdf" });
        }

        const outPdfPath = path.join(outCaseDir, "formulario.pdf");
        await new Promise<void>((resolve, reject) => {
          const doc = new PDFDocument({ margin: 40, size: "A4" });
          const stream = fs.createWriteStream(outPdfPath);
          doc.pipe(stream);

          // Header
          doc.fontSize(16).font("Helvetica-Bold").text("Formulario de Registro de Proveedor", { align: "center" });
          doc.fontSize(11).font("Helvetica").text(`Cliente: ${solicitud.cliente} | País: ${solicitud.pais}`, { align: "center" });
          doc.moveDown(1.5);

          doc.fontSize(10).font("Helvetica-Bold").text("Campos del Formulario:", { underline: true });
          doc.moveDown(0.5);

          for (const item of campos) {
            const val = valueMap.get(item.etiqueta.trim());
            const displayVal = val !== undefined ? val : "[FALTANTE EN MAESTRO]";
            const reqLabel = item.obligatorio ? " (*)" : "";

            doc.font("Helvetica-Bold").text(`${item.etiqueta}${reqLabel}: `, { continued: true });
            if (val !== undefined) {
              doc.font("Helvetica").text(displayVal);
            } else {
              doc.font("Helvetica-Oblique").text(displayVal);
            }
          }

          doc.moveDown(2);
          doc.fontSize(9).font("Helvetica-Oblique").text("Generado automáticamente por Periferia IT Group - Sujeto a firma del Representante Legal.", { align: "center" });

          doc.end();
          stream.on("finish", () => resolve());
          stream.on("error", (err) => reject(err));
        });

        logToolExecution(ctx, args.caso, "proveedor_generar_formulario", true, `Generado ${outPdfPath}`);
        return JSON.stringify({
          ok: true,
          data: {
            ruta: path.relative(ctx.directory, outPdfPath),
            formato: "pdf",
          },
        });
      } else if (solicitud.formato === "portal") {
        // --- P2: PORTAL WEB (Exportar Markdown) ---
        const plantillaPath = path.join(caseDir, "plantilla-campos.json");
        const campos = safeReadJson<Array<{ etiqueta: string; obligatorio?: boolean }>>(plantillaPath) || [];

        let mdContent = `# Valores para diligenciamiento en portal web\n`;
        mdContent += `**Cliente:** ${solicitud.cliente}\n`;
        mdContent += `**País:** ${solicitud.pais}\n\n`;
        mdContent += `> *Aviso: Formato portal web no permite llenado directo. Utilice estos valores para copiar en el portal del cliente.*\n\n`;
        mdContent += `| Campo | Obligatorio | Valor |\n|---|---|---|\n`;

        for (const item of campos) {
          const val = valueMap.get(item.etiqueta.trim()) ?? "[FALTANTE EN MAESTRO]";
          mdContent += `| ${item.etiqueta} | ${item.obligatorio ? "Sí" : "No"} | ${val} |\n`;
        }

        const outPortalPath = path.join(outCaseDir, "valores-portal.md");
        fs.writeFileSync(outPortalPath, mdContent, "utf-8");

        logToolExecution(ctx, args.caso, "proveedor_generar_formulario", true, `Generado ${outPortalPath} (formato no soportado)`);
        return JSON.stringify({
          ok: true,
          data: {
            ruta: path.relative(ctx.directory, outPortalPath),
            formato: "portal",
            aviso: "formato no soportado, valores listos para copiar generados en markdown",
          },
        });
      } else {
        const err = `Formato '${solicitud.formato}' no reconocido`;
        logToolExecution(ctx, args.caso, "proveedor_generar_formulario", false, err);
        return JSON.stringify({ ok: false, error: err });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToolExecution(ctx, args.caso, "proveedor_generar_formulario", false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

// --- TOOL 4: armar_paquete ---
export const armar_paquete = {
  description: "Arma el paquete para firma con formulario, soportes exigidos copiados, checklist de vigencias y borrador de correo.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    try {
      const caseDir = getCaseDir(ctx, args.caso);
      const repoDir = getRepoDir(ctx);

      const solicitud = safeReadJson<{
        id: string;
        de: string;
        asunto: string;
        fecha: string;
        pais: string;
        cliente: string;
        formato: string;
      }>(path.join(caseDir, "solicitud.json"));

      if (!solicitud) {
        return JSON.stringify({ ok: false, error: `Caso '${args.caso}' no existe.` });
      }

      const soportesIndex = safeReadJson<Array<{
        tipo: string;
        archivo: string;
        vigencia_hasta: string | null;
        pais_emisor: string;
        descripcion: string;
      }>>(path.join(repoDir, "repositorio/soportes/index.json")) || [];

      const soportesExigidos = safeReadJson<string[]>(path.join(caseDir, "soportes-exigidos.json")) || [];

      // Ensure package folder
      const paqueteDir = path.resolve(ctx.directory, "out", args.caso, "paquete");
      ensureDir(paqueteDir);

      // Copy generated form into package if exists
      const outCaseDir = path.resolve(ctx.directory, "out", args.caso);
      const possibleForms = ["formulario.xlsx", "formulario.pdf", "valores-portal.md"];
      for (const formFile of possibleForms) {
        const src = path.join(outCaseDir, formFile);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(paqueteDir, formFile));
        }
      }

      // Check soportes vigencia and existence
      // Execution date: either provided in ctx, or today
      const refDateStr = ctx.executionDate || new Date().toISOString().split("T")[0];
      const refDate = new Date(refDateStr);

      const presentes: string[] = [];
      const ausentes: string[] = [];
      const vencidos: string[] = [];

      for (const tipoExigido of soportesExigidos) {
        const item = soportesIndex.find((s) => s.tipo === tipoExigido);
        if (!item) {
          ausentes.push(tipoExigido);
          continue;
        }

        const srcFile = path.join(repoDir, "repositorio/soportes", item.archivo);
        if (!fs.existsSync(srcFile)) {
          ausentes.push(tipoExigido);
          continue;
        }

        // Copy support file to package
        fs.copyFileSync(srcFile, path.join(paqueteDir, item.archivo));

        // Check vigencia
        if (item.vigencia_hasta) {
          const vigenciaDate = new Date(item.vigencia_hasta);
          if (vigenciaDate < refDate) {
            vencidos.push(`${tipoExigido} (venció ${item.vigencia_hasta})`);
          } else {
            presentes.push(tipoExigido);
          }
        } else {
          presentes.push(tipoExigido);
        }
      }

      // Check fields for checklist report
      const mappingRes = JSON.parse(await mapear_campos.execute({ caso: args.caso }, ctx));
      const faltantesList: string[] = mappingRes.ok ? mappingRes.data.faltantes.map((f: { etiqueta: string }) => f.etiqueta) : [];

      // RN3: Un soporte vencido bloquea listo_para_firma. Un soporte ausente lo bloquea. Faltante no lo bloquea.
      const listo_para_firma = ausentes.length === 0 && vencidos.length === 0;

      // 1. Write checklist.md
      let checklistMd = `# Checklist de Paquete para Firma — Caso ${args.caso}\n\n`;
      checklistMd += `**Cliente:** ${solicitud.cliente} (${solicitud.pais})\n`;
      checklistMd += `**Fecha de evaluación:** ${refDateStr}\n`;
      checklistMd += `**Estado listo para firma:** ${listo_para_firma ? "✅ LISTO" : "❌ BLOQUEADO"}\n\n`;

      checklistMd += `### Soportes Exigidos\n`;
      checklistMd += `- **Presentes (${presentes.length}):** ${presentes.length ? presentes.join(", ") : "Ninguno"}\n`;
      checklistMd += `- **Ausentes (${ausentes.length}):** ${ausentes.length ? ausentes.join(", ") : "Ninguno"}\n`;
      checklistMd += `- **Vencidos (${vencidos.length}):** ${vencidos.length ? vencidos.join(", ") : "Ninguno"}\n\n`;

      checklistMd += `### Campos Faltantes en Formulario\n`;
      if (faltantesList.length > 0) {
        checklistMd += `- ${faltantesList.join("\n- ")}\n`;
      } else {
        checklistMd += `Ninguno. Todos los campos solicitados existen en el repositorio maestro.\n`;
      }

      fs.writeFileSync(path.join(paqueteDir, "checklist.md"), checklistMd, "utf-8");

      // 2. Write borrador-correo.md (RN2: NUNCA incluir datos bancarios)
      let correoMd = `**Para:** ${solicitud.de}\n`;
      correoMd += `**Asunto:** Re: ${solicitud.asunto}\n\n`;
      correoMd += `Estimados señores de ${solicitud.cliente},\n\n`;
      correoMd += `Reciban un cordial saludo de parte de Periferia IT Group S.A.S.\n\n`;
      correoMd += `Adjuntamos a la presente el formulario de registro de proveedor debidamente diligenciado y firmado por nuestro representante legal, junto con los soportes requeridos:\n\n`;

      for (const pres of presentes) {
        const item = soportesIndex.find((s) => s.tipo === pres);
        correoMd += `- ${item ? item.descripcion : pres}\n`;
      }

      if (ausentes.length > 0 || vencidos.length > 0) {
        correoMd += `\n*Nota sobre soportes pendientes de actualización:*\n`;
        if (vencidos.length > 0) correoMd += `- Documentos en proceso de renovación: ${vencidos.join(", ")}\n`;
        if (ausentes.length > 0) correoMd += `- Documentos adicionales solicitados: ${ausentes.join(", ")}\n`;
      }

      correoMd += `\nQuedamos a su disposición para cualquier inquietud adicional.\n\n`;
      correoMd += `Atentamente,\n\n`;
      correoMd += `**Roberto Andrade Salazar**\n`;
      correoMd += `Representante Legal / Gerente General\n`;
      correoMd += `Periferia IT Group S.A.S.\n`;

      fs.writeFileSync(path.join(paqueteDir, "borrador-correo.md"), correoMd, "utf-8");

      const relativeRuta = path.relative(ctx.directory, paqueteDir);
      logToolExecution(
        ctx,
        args.caso,
        "proveedor_armar_paquete",
        true,
        `Paquete armado en ${relativeRuta}. Listo para firma: ${listo_para_firma}`
      );

      return JSON.stringify({
        ok: true,
        data: {
          ruta: relativeRuta,
          listo_para_firma,
          checklist: {
            presentes,
            ausentes,
            vencidos,
            faltantes_formulario: faltantesList,
          },
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToolExecution(ctx, args.caso, "proveedor_armar_paquete", false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

// --- TOOL 5: simular_envio ---
export const simular_envio = {
  description: "Simula el envío del paquete al cliente únicamente si existe confirmación explícita del usuario.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    confirmado: z.boolean().describe("Debe ser true tras confirmación explícita del usuario en el turno anterior."),
  },
  async execute(args: { caso: string; confirmado: boolean }, ctx: ToolContext): Promise<string> {
    try {
      if (!args.confirmado) {
        const err = "requiere confirmación explícita";
        logToolExecution(ctx, args.caso, "proveedor_simular_envio", false, err);
        return JSON.stringify({ ok: false, error: err });
      }

      const caseDir = getCaseDir(ctx, args.caso);
      const solicitud = safeReadJson<{ cliente: string; de: string; asunto: string }>(path.join(caseDir, "solicitud.json"));

      const outCaseDir = path.resolve(ctx.directory, "out", args.caso);
      ensureDir(outCaseDir);

      const simPath = path.join(outCaseDir, "ENVIO-SIMULADO.md");
      const ts = new Date().toISOString();

      let simContent = `# Registro de Envío Simulado\n\n`;
      simContent += `**Fecha / Hora:** ${ts}\n`;
      simContent += `**Caso:** ${args.caso}\n`;
      simContent += `**Cliente:** ${solicitud?.cliente || "N/A"}\n`;
      simContent += `**Destinatario:** ${solicitud?.de || "N/A"}\n`;
      simContent += `**Asunto:** Re: ${solicitud?.asunto || "N/A"}\n`;
      simContent += `**Confirmación humana:** Otorgada explícitamente en el turno anterior.\n\n`;
      simContent += `### Archivos que habrían sido enviados:\n`;

      const paqueteDir = path.join(outCaseDir, "paquete");
      if (fs.existsSync(paqueteDir)) {
        const files = fs.readdirSync(paqueteDir);
        for (const file of files) {
          simContent += `- ${file}\n`;
        }
      } else {
        simContent += `- [Sin archivos de paquete generados]\n`;
      }

      simContent += `\n> Envío completado en modo simulación (RN4 respetada).\n`;
      fs.writeFileSync(simPath, simContent, "utf-8");

      const relativeRuta = path.relative(ctx.directory, simPath);
      logToolExecution(ctx, args.caso, "proveedor_simular_envio", true, `Simulado envío en ${relativeRuta}`);

      return JSON.stringify({
        ok: true,
        data: {
          ruta: relativeRuta,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToolExecution(ctx, args.caso, "proveedor_simular_envio", false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};
