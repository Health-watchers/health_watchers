import request from 'supertest';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';

const app = express();
app.use(express.json());
app.use(mongoSanitize({ replaceWith: '_' }));

app.post('/test', (req, res) => {
  res.json({ body: req.body });
});

app.get('/test', (req, res) => {
  res.json({ query: req.query });
});

describe('NoSQL injection prevention', () => {
  describe('express-mongo-sanitize middleware', () => {
    it('strips $ operators from request body', async () => {
      const res = await request(app)
        .post('/test')
        .send({ username: { $gt: '' }, password: 'anything' });

      expect(res.status).toBe(200);
      expect(res.body.body.username).not.toHaveProperty('$gt');
    });

    it('replaces $ keys with underscore in request body', async () => {
      const res = await request(app)
        .post('/test')
        .send({ '$where': 'this.password.length > 0' });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$where');
    });

    it('sanitizes nested operator injection in body', async () => {
      const res = await request(app)
        .post('/test')
        .send({ filter: { age: { $gte: 0 }, name: { $regex: '.*' } } });

      expect(res.status).toBe(200);
      const filter = res.body.body.filter;
      expect(filter.age).not.toHaveProperty('$gte');
      expect(filter.name).not.toHaveProperty('$regex');
    });

    it('allows clean input through unchanged', async () => {
      const payload = { username: 'alice', clinicId: 'clinic-123', active: true };
      const res = await request(app).post('/test').send(payload);

      expect(res.status).toBe(200);
      expect(res.body.body).toMatchObject(payload);
    });

    it('sanitizes $ operators in query string', async () => {
      const res = await request(app).get('/test?filter[$gt]=0');

      expect(res.status).toBe(200);
      const filter = res.body.query.filter;
      if (filter && typeof filter === 'object') {
        expect(filter).not.toHaveProperty('$gt');
      }
    });

    it('handles array payloads without crashing', async () => {
      const res = await request(app)
        .post('/test')
        .send({ ids: ['id1', 'id2', '$injection'] });

      expect(res.status).toBe(200);
    });
  });
});
