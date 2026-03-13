import { defineTool } from '../types/tools';

export interface Question {
  question: string;
  suggestedAnswers: string[];
}

export default defineTool(
  'qanda',
  'Ask the user up to 3 questions with suggested answers to gather more information. This is only if you are un-sure of a certain thing or prompting the user for additional information. This will prompt the user not another ai. An empty array of answers means the user skipped it.',
  {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Array of questions to ask (max 3)',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask'
            },
            suggestedAnswers: {
              type: 'array',
              description: 'Array of suggested answers (2-4 options)',
              items: { type: 'string' }
            }
          },
          required: ['question', 'suggestedAnswers']
        }
      }
    },
    required: ['questions']
  },
  async (args: { questions: Question[] }) => {
    // Trigger Q&A UI
    window.dispatchEvent(new CustomEvent('qanda', { detail: args.questions.slice(0, 3) }));
    
    // Wait for user responses
    return new Promise((resolve) => {
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent;
        window.removeEventListener('qanda-response', handler);
        resolve({ answers: customEvent.detail });
      };
      window.addEventListener('qanda-response', handler);
    });
  }
);
