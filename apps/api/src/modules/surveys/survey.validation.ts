import { z } from 'zod';

export const surveyResponseSchema = z.object({
  overallSatisfaction: z.number().min(1).max(5),
  waitTime: z.number().min(1).max(5),
  doctorCommunication: z.number().min(1).max(5),
  staffFriendliness: z.number().min(1).max(5),
  facilityCleanness: z.number().min(1).max(5),
  wouldRecommend: z.boolean(),
  comments: z.string().max(500).optional(),
});
