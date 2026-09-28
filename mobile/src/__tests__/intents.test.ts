import { parseIntent } from '@/services/assistant/intents';

describe('parseIntent', () => {
  it.each([
    ['What is in front of me?', { type: 'describe' }],
    ['describe the room', { type: 'describe' }],
    ['सामने क्या है', { type: 'describe' }],
    ['Read this', { type: 'read' }],
    ['what does this sign say', { type: 'read' }],
    ['summarize this page', { type: 'read', follow: 'summarize' }],
    ['find my phone', { type: 'find', target: 'phone' }],
    ['where is the exit', { type: 'find', target: 'exit' }],
    ['Where did I keep my wallet?', { type: 'where', target: 'wallet' }],
    ['where is my wallet', { type: 'where', target: 'wallet' }],
    ['remember my keys are here', { type: 'remember', target: 'keys' }],
    ['take me to the library', { type: 'navigate', target: 'library' }],
    ['help me', { type: 'emergency' }],
    ['I fell', { type: 'emergency' }],
    ['मदद', { type: 'emergency' }],
    ['repeat', { type: 'repeat' }],
    ['stop', { type: 'stop' }],
    ['how much is this note', { type: 'scan', kind: 'currency' }],
    ['read this medicine', { type: 'scan', kind: 'medicine' }],
    ['what are the ingredients', { type: 'scan', kind: 'product' }],
    ['is anyone waving', { type: 'people' }],
    ['speak slower', { type: 'setting', change: 'slower' }],
  ])('%s', (utterance, expected) => {
    expect(parseIntent(utterance)).toEqual(expected);
  });

  it('falls back to a free-form question for the vision model', () => {
    expect(parseIntent('Is there an empty seat?')).toEqual({ type: 'ask', query: 'Is there an empty seat?' });
  });
});
