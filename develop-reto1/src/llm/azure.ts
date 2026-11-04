import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatMessage, LLMAdapter, ToolDefinition } from "./adapter.js";

export class AzureLLMAdapter implements LLMAdapter {
  private client: AzureOpenAI | null = null;
  private deployment: string;
  private isConfigured: boolean = false;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o";
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";

    if (endpoint && apiKey && !apiKey.includes("your-api-key")) {
      try {
        this.client = new AzureOpenAI({
          endpoint,
          apiKey,
          apiVersion,
          deployment: this.deployment,
          timeout: 30000, // 30 seconds timeout
          maxRetries: 2,
        });
        this.isConfigured = true;
      } catch (err) {
        console.error("Error al inicializar cliente Azure OpenAI:", err);
      }
    }
  }

  public getStatus() {
    return {
      provider: "Azure OpenAI",
      deployment: this.deployment,
      configured: this.isConfigured,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT ? "Configurado (oculto)" : "No configurado",
    };
  }

  async enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<ChatMessage> {
    if (!this.client || !this.isConfigured) {
      throw new Error(
        "Proveedor Azure OpenAI no está configurado. Por favor define AZURE_OPENAI_ENDPOINT y AZURE_OPENAI_API_KEY en .env"
      );
    }

    try {
      // Map to OpenAI SDK format
      const openaiMessages: ChatCompletionMessageParam[] = mensajes.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.tool_call_id || "call_default",
            content: m.content || "",
          };
        }
        if (m.role === "assistant") {
          return {
            role: "assistant",
            content: m.content ?? null,
            tool_calls: m.tool_calls?.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          };
        }
        if (m.role === "system") {
          return {
            role: "system",
            content: m.content || "",
          };
        }
        return {
          role: "user",
          content: m.content || "",
        };
      });

      const openaiTools: ChatCompletionTool[] = herramientas.map((h) => ({
        type: "function",
        function: {
          name: h.name,
          description: h.description,
          parameters: h.parameters,
        },
      }));

      const response = await this.client.chat.completions.create({
        model: this.deployment,
        messages: openaiMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        temperature: 0.1,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error("Respuesta vacía recibida de Azure OpenAI");
      }

      const msg = choice.message;
      return {
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls?.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error en llamada a Azure OpenAI: ${errMessage}`);
    }
  }
}
