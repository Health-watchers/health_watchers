declare module 'pino-http' {
  import { Logger } from 'pino';
  import { RequestHandler } from 'express';

  interface Options {
    logger?: Logger;
    genReqId?: (req: any) => string;
    redact?: string[];
    [key: string]: any;
  }

  function pinoHttp(options?: Options): RequestHandler;
  export = pinoHttp;
}
