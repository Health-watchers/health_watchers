import { Request, Response } from 'express';
import { CPTModel } from './cpt.model';

export async function searchCPTCodes(req: Request, res: Response): Promise<void> {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Query parameter "q" is required',
    });
    return;
  }

  const results = await CPTModel.find(
    { $text: { $search: q } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(10)
    .lean();

  res.json({
    success: true,
    data: results,
  });
}

export async function getCPTByCode(req: Request, res: Response): Promise<void> {
  const { code } = req.params;

  const cpt = await CPTModel.findOne({ code }).lean();

  if (!cpt) {
    res.status(404).json({
      success: false,
      error: 'CPT code not found',
    });
    return;
  }

  res.json({
    success: true,
    data: cpt,
  });
}
