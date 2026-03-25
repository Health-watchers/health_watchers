import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express, Request, Response, NextFunction } from 'express';
import { config } from '@health-watchers/config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Health Watchers API',
      version: '1.0.0',
      description: 'AI-assisted EMR powered by Stellar blockchain',
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error:   { type: 'string' },
            message: { type: 'string' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data:   { },
          },
        },
      },
    },
  },
  apis: [`${__dirname}/../modules/**/*.ts`],
};

const spec = swaggerJsdoc(options);

const basicAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
    return res.status(401).send('Authentication required');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const docsUser = process.env.DOCS_USER || 'admin';
  const docsPass = process.env.DOCS_PASS || 'admin';
  if (user !== docsUser || pass !== docsPass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
    return res.status(401).send('Invalid credentials');
  }
  return next();
};

export const setupSwagger = (app: Express) => {
  const isProd = config.nodeEnv === 'production';
  const middleware = isProd ? [basicAuthMiddleware] : [];

  app.get('/api/docs/openapi.json', ...middleware, (_req: Request, res: Response) => {
    res.json(spec);
  });

  app.use('/api/docs', ...middleware, swaggerUi.serve, swaggerUi.setup(spec));
};
