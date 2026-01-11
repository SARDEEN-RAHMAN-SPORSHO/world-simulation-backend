import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });
  }

  async call(prompt, systemInstruction = '') {
    try {
      const fullPrompt = systemInstruction 
        ? `${systemInstruction}\n\n${prompt}` 
        : prompt;
      
      const result = await this.model.generateContent(fullPrompt);
      const text = result.response.text();
      
      // Try to extract JSON from markdown code blocks
      let cleanedText = text.trim();
      
      // Remove markdown code fences
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
      }
      
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
      }
      
      cleanedText = cleanedText.trim();
      
      // Try to parse as JSON
      if (cleanedText.startsWith('{') || cleanedText.startsWith('[')) {
        try {
          return JSON.parse(cleanedText);
        } catch (parseError) {
          console.warn('Failed to parse JSON response:', parseError.message);
          return { raw: text, parseError: true };
        }
      }
      
      return { raw: text };
    } catch (error) {
      console.error('❌ Gemini API Error:', error.message);
      
      // Handle rate limiting
      if (error.message.includes('429') || error.message.includes('quota')) {
        return { 
          error: 'RATE_LIMIT',
          message: 'API rate limit reached. Waiting before retry.',
          shouldRetry: true
        };
      }
      
      return { 
        error: error.message,
        shouldRetry: false
      };
    }
  }

  async callWithRetry(prompt, systemInstruction = '', maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      const result = await this.call(prompt, systemInstruction);
      
      if (!result.error) {
        return result;
      }
      
      if (!result.shouldRetry) {
        throw new Error(result.error);
      }
      
      // Exponential backoff
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    throw new Error('Max retries reached for Gemini API call');
  }
}
