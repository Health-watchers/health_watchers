import { Request, Response, NextFunction } from 'express';
import { type LazyLoadQuery } from '../types/express';

export const parseLazyLoadQuery = (req: Request, res: Response, next: NextFunction) => {
  const query = req.query as LazyLoadQuery;

  if (typeof query.fields === 'string') {
    query.fields = query.fields.split(',');
  }

  if (typeof query.excludeFields === 'string') {
    query.excludeFields = query.excludeFields.split(',');
  }

  if (typeof query.populate === 'string') {
    query.populate = query.populate.split(',');
  }

  query.lazyLoad = query.lazyLoad !== 'false' && query.lazyLoad !== '0';

  req.lazyLoadQuery = query;

  next();
};

export const attachLazyLoadQuery = (req: Request, options: LazyLoadQuery) => {
  req.lazyLoadQuery = options;
};
