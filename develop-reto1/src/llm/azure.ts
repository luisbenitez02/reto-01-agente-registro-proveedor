import type { ChatMessage, LLMAdapter, ToolDefinition } from "./adapter.js";

export class AzureLLMAdapter implements LLMAdapter {
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private isConfigured: boolean = false;

  constructor() {
    let rawEndpoint = process.env.AZURE_OPENAI_ENDPOINT || "";
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || "";
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-5.2";

    if (rawEndpoint) {
      if (!rawEndpoint.includes("/openai/v1/responses")) {
        rawEndpoint = rawEndpoint.replace(/\/+$/, "") + "/openai/v1/responses";
      }
      this.endpoint = rawEndpoint;
    } else {
      this.endpoint = "https://luisbenitez-14-7595-resource.services.ai.azure.com/openai/v1/responses";
    }

    if (this.apiKey && !this.apiKey.includes("your-api-key")) {
      this.isConfigured = true;
    }
  }

  public getStatus() {
    return {
      provider: "Azure AI (Responses API)",
      deployment: this.deployment,
      configured: this.isConfigured,
      endpoint: this.endpoint ? "Configurado (oculto)" : "No configurado",
    };
  }

  async enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<ChatMessage> {
    if (!this.apiKey || !this.isConfigured) {
      throw new Error(
        "Proveedor Azure OpenAI no está configurado. Por favor define AZURE_OPENAI_ENDPOINT y AZURE_OPENAI_API_KEY en .env"
      );
    }

    try {
      let instructions = "";
      const inputItems: any[] = [];

      for (const m of mensajes) {
        if (m.role === "system") {
          instructions = m.content || "";
          continue;
        }

        if (m.role === "user") {
          inputItems.push({
            role: "user",
            content: m.content || "",
          });
        } else if (m.role === "assistant") {
          if (m.tool_calls && m.tool_calls.length > 0) {
            for (const tc of m.tool_calls) {
              inputItems.push({
                type: "function_call",
                name: tc.function.name,
                call_id: tc.id,
                arguments: tc.function.arguments,
              });
            }
          }
          if (m.content) {
            inputItems.push({
              role: "assistant",
              content: m.content,
            });
          }
        } else if (m.role === "tool") {
          inputItems.push({
            type: "function_call_output",
            call_id: m.tool_call_id,
            output: m.content,
          });
        }
      }

      const formattedTools = herramientas.map((h) => ({
        type: "function",
        name: h.name,
        description: h.description,
        parameters: h.parameters,
      }));

      const payload: Record<string, any> = {
        model: this.deployment,
        input: inputItems,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      };

      if (instructions) {
        payload.instructions = instructions;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { output?: any[] };
      const outputList = data.output || [];

      const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
      let assistantText = "";

      for (const item of outputList) {
        if (item.type === "function_call") {
          toolCalls.push({
            id: item.call_id || item.id,
            type: "function",
            function: {
              name: item.name,
              arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments),
            },
          });
        } else if (item.type === "message" && item.content) {
          for (const c of item.content) {
            if (c.type === "output_text" && c.text) {
              assistantText += (assistantText ? "\n\n" : "") + c.text;
            }
          }
        }
      }

      return {
        role: "assistant",
        content: assistantText || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error en llamada a Azure OpenAI: ${errMessage}`);
    }
  }
}
