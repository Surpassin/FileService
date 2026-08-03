import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function runAgent(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string,
  maxTokens: number = 4096
): Promise<string> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return textBlock.text;
  } catch (error: any) {
    handleAnthropicError(error);
    throw error;
  }
}

// Run an agent with a PDF document attached (Claude reads the PDF natively)
export async function runAgentWithDocument(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string,
  documentBase64: string,
  documentName: string,
  maxTokens: number = 8192
): Promise<string> {
  try {
    const apiMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
      // Attach the PDF to the first user message so Claude has it as context
      if (m.role === 'user' && i === messages.findIndex((x) => x.role === 'user')) {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: documentBase64,
              },
              title: documentName,
            },
            { type: 'text' as const, text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return textBlock.text;
  } catch (error: any) {
    handleAnthropicError(error);
    throw error;
  }
}

function handleAnthropicError(error: any): void {
  if (error?.status === 401) {
    throw new Error('Invalid Anthropic API key. Check ANTHROPIC_API_KEY environment variable.');
  }
  if (error?.status === 429) {
    throw new Error('Anthropic API rate limit exceeded. Please try again later.');
  }
  if (error?.status === 529) {
    throw new Error('Anthropic API is temporarily overloaded. Please try again later.');
  }
  throw new Error(`Agent execution failed: ${error?.message || 'Unknown error'}`);
}
