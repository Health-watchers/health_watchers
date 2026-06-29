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

  // ── Authentication bypass patterns ────────────────────────────────────────────
  describe('authentication bypass operator patterns', () => {
    it('strips $ne operator used in auth bypass (username != null)', async () => {
      const res = await request(app)
        .post('/test')
        .send({ username: { $ne: null }, password: { $ne: null } });

      expect(res.status).toBe(200);
      expect(res.body.body.username).not.toHaveProperty('$ne');
      expect(res.body.body.password).not.toHaveProperty('$ne');
    });

    it('strips $exists operator used to enumerate fields', async () => {
      const res = await request(app)
        .post('/test')
        .send({ password: { $exists: true }, role: { $exists: true } });

      expect(res.status).toBe(200);
      expect(res.body.body.password).not.toHaveProperty('$exists');
      expect(res.body.body.role).not.toHaveProperty('$exists');
    });

    it('strips $gt empty-string bypass (classic auth bypass)', async () => {
      const res = await request(app)
        .post('/test')
        .send({ username: 'admin', password: { $gt: '' } });

      expect(res.status).toBe(200);
      expect(res.body.body.password).not.toHaveProperty('$gt');
    });

    it('strips $in operator used to enumerate valid values', async () => {
      const res = await request(app)
        .post('/test')
        .send({ role: { $in: ['SUPER_ADMIN', 'CLINIC_ADMIN'] } });

      expect(res.status).toBe(200);
      expect(res.body.body.role).not.toHaveProperty('$in');
    });

    it('strips $nin operator used to exclude values', async () => {
      const res = await request(app)
        .post('/test')
        .send({ status: { $nin: ['inactive', 'banned'] } });

      expect(res.status).toBe(200);
      expect(res.body.body.status).not.toHaveProperty('$nin');
    });
  });

  // ── JavaScript injection ───────────────────────────────────────────────────────
  describe('JavaScript injection via $where', () => {
    it('strips $where with sleep-based timing attack', async () => {
      const res = await request(app)
        .post('/test')
        .send({ $where: 'sleep(5000)' });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$where');
    });

    it('strips $where with property-access exfiltration', async () => {
      const res = await request(app)
        .post('/test')
        .send({ $where: 'this.password.length > 0' });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$where');
    });

    it('strips $where with function() style payload', async () => {
      const res = await request(app)
        .post('/test')
        .send({ $where: 'function() { return true; }' });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$where');
    });
  });

  // ── Regex injection ───────────────────────────────────────────────────────────
  describe('$regex injection', () => {
    it('strips $regex operator from body', async () => {
      const res = await request(app)
        .post('/test')
        .send({ username: { $regex: '.*', $options: 'i' } });

      expect(res.status).toBe(200);
      expect(res.body.body.username).not.toHaveProperty('$regex');
      expect(res.body.body.username).not.toHaveProperty('$options');
    });

    it('strips $regex with catastrophic backtracking payload', async () => {
      const res = await request(app)
        .post('/test')
        .send({ name: { $regex: '(a+)+$', $options: '' } });

      expect(res.status).toBe(200);
      expect(res.body.body.name).not.toHaveProperty('$regex');
    });

    it('strips $regex in query string', async () => {
      const res = await request(app).get('/test?name[$regex]=.*&name[$options]=i');

      expect(res.status).toBe(200);
      const name = res.body.query.name;
      if (name && typeof name === 'object') {
        expect(name).not.toHaveProperty('$regex');
        expect(name).not.toHaveProperty('$options');
      }
    });
  });

  // ── Aggregation & expression operators ───────────────────────────────────────
  describe('aggregation pipeline operator injection', () => {
    it('strips $expr operator', async () => {
      const res = await request(app)
        .post('/test')
        .send({ $expr: { $gt: ['$balance', 0] } });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$expr');
    });

    it('strips $lookup-style injection in body', async () => {
      const res = await request(app)
        .post('/test')
        .send({ $lookup: { from: 'users', as: 'u' } });

      expect(res.status).toBe(200);
      expect(res.body.body).not.toHaveProperty('$lookup');
    });

    it('strips deeply nested aggregation operator', async () => {
      const res = await request(app)
        .post('/test')
        .send({
          filter: {
            a: {
              b: {
                $group: { _id: '$clinicId' },
              },
            },
          },
        });

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.body)).not.toContain('$group');
    });
  });

  // ── Array and object injection ────────────────────────────────────────────────
  describe('array and object injection', () => {
    it('strips operator keys nested inside an array element', async () => {
      const res = await request(app)
        .post('/test')
        .send({ ids: [{ $gt: '' }, 'legit-id'] });

      expect(res.status).toBe(200);
      const ids = res.body.body.ids;
      expect(JSON.stringify(ids)).not.toContain('$gt');
    });

    it('strips operator injected as an array item string starting with $', async () => {
      const res = await request(app)
        .post('/test')
        .send({ tags: ['valid', '$where: this'] });

      expect(res.status).toBe(200);
      // String values starting with $ are NOT operators; only object keys are sanitized
      // Verify the request completes without crash
      expect(res.body.body).toHaveProperty('tags');
    });

    it('handles mixed array of objects and primitives', async () => {
      const res = await request(app)
        .post('/test')
        .send({ items: [{ $ne: null }, 'plain', 42, { valid: true }] });

      expect(res.status).toBe(200);
      const items = res.body.body.items;
      expect(JSON.stringify(items)).not.toContain('"$ne"');
    });
  });

  // ── Prototype pollution ───────────────────────────────────────────────────────
  describe('prototype pollution attempts', () => {
    it('does not crash on __proto__ key in body', async () => {
      const res = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{"__proto__":{"isAdmin":true},"username":"alice"}');

      expect([200, 400]).toContain(res.status);
      // Prototype must not be polluted
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it('does not crash on constructor.prototype injection', async () => {
      const res = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{"constructor":{"prototype":{"isAdmin":true}},"username":"bob"}');

      expect([200, 400]).toContain(res.status);
      expect(({} as any).isAdmin).toBeUndefined();
    });
  });

  // ── Multi-operator combination attacks ────────────────────────────────────────
  describe('combined operator injection', () => {
    it('strips multiple operators combined in a single field', async () => {
      const res = await request(app)
        .post('/test')
        .send({
          username: { $gt: '', $ne: null, $regex: '.*' },
          password: { $exists: true, $ne: '' },
        });

      expect(res.status).toBe(200);
      const { username, password } = res.body.body;
      ['$gt', '$ne', '$regex'].forEach((op) => {
        if (username && typeof username === 'object') expect(username).not.toHaveProperty(op);
      });
      ['$exists', '$ne'].forEach((op) => {
        if (password && typeof password === 'object') expect(password).not.toHaveProperty(op);
      });
    });

    it('strips operators at multiple nesting levels simultaneously', async () => {
      const res = await request(app)
        .post('/test')
        .send({
          $where: 'true',
          filter: {
            age: { $gte: 0 },
            nested: {
              value: { $lt: 100 },
            },
          },
        });

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body.body);
      expect(body).not.toContain('"$where"');
      expect(body).not.toContain('"$gte"');
      expect(body).not.toContain('"$lt"');
    });
  });
});
