import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function runAgent(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string
): Promise<string> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
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
}
