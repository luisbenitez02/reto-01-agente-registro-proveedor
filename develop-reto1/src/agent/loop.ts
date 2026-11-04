import * as fs from "node:fs";
import * as path from "node:path";
import type { ChatMessage, LLMAdapter, ToolDefinition } from "../llm/adapter.js";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
  type ToolContext,
} from "../tools/proveedor.js";

export interface AgentStepToolCall {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentTurnResponse {
  reply: string;
  toolCalls: AgentStepToolCall[];
  needsConfirmation: boolean;
}

// Map tools to LLM ToolDefinitions
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "proveedor_leer_solicitud",
    description: leer_solicitud.description,
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en fixtures/reto-01/casos/ (ej: 'ec-corp-andina')",
        },
      },
      required: ["caso"],
    },
  },
  {
    name: "proveedor_mapear_campos",
    description: mapear_campos.description,
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en fixtures/reto-01/casos/",
        },
      },
      required: ["caso"],
    },
  },
  {
    name: "proveedor_generar_formulario",
    description: generar_formulario.description,
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en fixtures/reto-01/casos/",
        },
      },
      required: ["caso"],
    },
  },
  {
    name: "proveedor_armar_paquete",
    description: armar_paquete.description,
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en fixtures/reto-01/casos/",
        },
      },
      required: ["caso"],
    },
  },
  {
    name: "proveedor_simular_envio",
    description: simular_envio.description,
    parameters: {
      type: "object",
      properties: {
        caso: {
          type: "string",
          description: "Nombre de la carpeta del caso en fixtures/reto-01/casos/",
        },
        confirmado: {
          type: "boolean",
          description: "true si el usuario otorgó confirmación explícita para enviar.",
        },
      },
      required: ["caso", "confirmado"],
    },
  },
];

export class AgentSession {
  public id: string;
  public messages: ChatMessage[] = [];
  public awaitingConfirmationForCase: string | null = null;
  private directory: string;
  private maxIterations: number = 25;

  constructor(id: string, directory: string) {
    this.id = id;
    this.directory = directory;
    this.initSystemPrompt();
  }

  private initSystemPrompt() {
    let systemPrompt = "";
    const promptPath = path.resolve(this.directory, "agent/prompt.md");
    if (fs.existsSync(promptPath)) {
      systemPrompt += fs.readFileSync(promptPath, "utf-8");
    }

    const knowledgePath = path.resolve(this.directory, "src/knowledge/registro-proveedor.md");
    if (fs.existsSync(knowledgePath)) {
      systemPrompt += "\n\n# Base de Conocimiento Complementaria:\n" + fs.readFileSync(knowledgePath, "utf-8");
    }

    this.messages.push({
      role: "system",
      content: systemPrompt || "Eres un asistente de registro de proveedores de Periferia IT Group.",
    });
  }

  async runTurn(userInput: string, adapter: LLMAdapter): Promise<AgentTurnResponse> {
    const executedToolCalls: AgentStepToolCall[] = [];
    const lowerInput = userInput.toLowerCase().trim();

    // Check if user confirmed
    const isAffirmative =
      lowerInput === "sí" ||
      lowerInput === "si" ||
      lowerInput === "confirmo" ||
      lowerInput === "confirmado" ||
      lowerInput === "procede" ||
      lowerInput === "adelante" ||
      lowerInput === "envía" ||
      lowerInput === "envia" ||
      lowerInput.includes("procede con el envío") ||
      lowerInput.includes("sí, envía");

    let userConfirmedThisTurn = false;
    if (this.awaitingConfirmationForCase && isAffirmative) {
      userConfirmedThisTurn = true;
    }

    this.messages.push({ role: "user", content: userInput });

    let iterations = 0;
    const ctx: ToolContext = {
      directory: this.directory,
      sessionId: this.id,
      executionDate: "2026-09-03",
    };

    while (iterations < this.maxIterations) {
      iterations++;

      // Request next action from LLM
      let assistantMsg: ChatMessage;
      try {
        assistantMsg = await adapter.enviar(this.messages, AGENT_TOOLS);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          reply: `⚠️ Ocurrió un error al consultar el modelo de lenguaje: ${errorMsg}`,
          toolCalls: executedToolCalls,
          needsConfirmation: false,
        };
      }

      this.messages.push(assistantMsg);

      // If no tool calls, this is the final response of the turn
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const reply = assistantMsg.content || "";
        
        // Detect if assistant is asking for confirmation
        const asksForConfirmation =
          reply.toLowerCase().includes("¿deseas") ||
          reply.toLowerCase().includes("¿confirmas") ||
          reply.toLowerCase().includes("confirmación") ||
          reply.toLowerCase().includes("confirmacion") ||
          reply.toLowerCase().includes("¿procedo") ||
          reply.toLowerCase().includes("¿procedemos");

        if (asksForConfirmation) {
          // Extract case if possible
          const matchCase = reply.match(/(co-industrias-delta|ec-corp-andina|hn-agroexport-sula|pa-logistica-istmo)/);
          this.awaitingConfirmationForCase = matchCase ? matchCase[0] : (this.awaitingConfirmationForCase || "caso-activo");
        } else if (userConfirmedThisTurn) {
          this.awaitingConfirmationForCase = null;
        }

        return {
          reply,
          toolCalls: executedToolCalls,
          needsConfirmation: asksForConfirmation,
        };
      }

      // Execute each tool call requested by the model
      for (const call of assistantMsg.tool_calls) {
        const fnName = call.function.name;
        let fnArgs: Record<string, any> = {};
        try {
          fnArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        // Enforce RN4 check if model tries to call proveedor_simular_envio
        if (fnName === "proveedor_simular_envio") {
          if (!userConfirmedThisTurn && !fnArgs.confirmado) {
            fnArgs.confirmado = false;
          } else if (userConfirmedThisTurn) {
            fnArgs.confirmado = true;
          }
        }

        let rawToolResult = "";
        try {
          switch (fnName) {
            case "proveedor_leer_solicitud":
              rawToolResult = await leer_solicitud.execute(fnArgs as { caso: string }, ctx);
              break;
            case "proveedor_mapear_campos":
              rawToolResult = await mapear_campos.execute(fnArgs as { caso: string }, ctx);
              break;
            case "proveedor_generar_formulario":
              rawToolResult = await generar_formulario.execute(fnArgs as { caso: string }, ctx);
              break;
            case "proveedor_armar_paquete":
              rawToolResult = await armar_paquete.execute(fnArgs as { caso: string }, ctx);
              break;
            case "proveedor_simular_envio":
              rawToolResult = await simular_envio.execute(fnArgs as { caso: string; confirmado: boolean }, ctx);
              break;
            default:
              rawToolResult = JSON.stringify({ ok: false, error: `Herramienta desconocida '${fnName}'` });
          }
        } catch (execErr) {
          rawToolResult = JSON.stringify({
            ok: false,
            error: execErr instanceof Error ? execErr.message : String(execErr),
          });
        }

        let parsedResult: Record<string, unknown> = {};
        try {
          parsedResult = JSON.parse(rawToolResult);
        } catch {
          parsedResult = { raw: rawToolResult };
        }

        executedToolCalls.push({
          name: fnName,
          args: fnArgs,
          result: parsedResult,
        });

        // Append tool result message to conversation history
        this.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: rawToolResult,
        });
      }
    }

    return {
      reply: "Se alcanzó el tope de iteraciones del agente (25). Por favor revisa los pasos ejecutados.",
      toolCalls: executedToolCalls,
      needsConfirmation: false,
    };
  }
}

