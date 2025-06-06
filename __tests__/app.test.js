const request = require('supertest');

let app;

beforeAll(() => {
  process.env.OPENAI_API_KEY = 'test';
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.GOOGLE_API_KEY = '';
  process.env.NODE_ENV = 'test';
  jest.resetModules();
  app = require('../src/app');
});

describe('API Endpoints', () => {
  test('GET /api/providers returns available providers', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.statusCode).toBe(200);
    expect(res.body.providers).toEqual(['GPT-4', 'Claude']);
  });

  test('POST /api/generateFAQ returns combined answers', async () => {
    const questions = [{ id: 1, topic: 'test', question: 'What is testing?' }];
    const res = await request(app)
      .post('/api/generateFAQ')
      .send({ questions });
    expect(res.statusCode).toBe(200);
    expect(res.body.faqs[0].answer).toContain('Combined answer:');
  });

  test('GET /api/exportFAQ returns JSONL after generation', async () => {
    const questions = [{ id: 1, topic: 'test', question: 'Why?' }];
    await request(app).post('/api/generateFAQ').send({ questions });
    const res = await request(app).get('/api/exportFAQ');
    expect(res.statusCode).toBe(200);
    expect(res.text.trim()).toContain('"prompt"');
    expect(res.header['content-type']).toMatch(/text\/plain/);
  });

  test('POST /api/generateQuestions missing topics returns 400', async () => {
    const res = await request(app)
      .post('/api/generateQuestions')
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/smartSort missing questions returns 400', async () => {
    const res = await request(app)
      .post('/api/smartSort')
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/generateTopicVariations missing topic returns 400', async () => {
    const res = await request(app)
      .post('/api/generateTopicVariations')
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/generateSmartTags missing text returns 400', async () => {
    const res = await request(app)
      .post('/api/generateSmartTags')
      .send({});
    expect(res.statusCode).toBe(400);
  });
});
