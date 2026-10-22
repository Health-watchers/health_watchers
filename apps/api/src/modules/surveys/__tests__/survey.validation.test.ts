import { surveyResponseSchema } from '../survey.validation';

const validResponse = {
  overallSatisfaction: 5,
  waitTime: 4,
  doctorCommunication: 5,
  staffFriendliness: 5,
  facilityCleanness: 4,
  wouldRecommend: true,
};

describe('surveyResponseSchema', () => {
  it('accepts a valid survey response', () => {
    expect(surveyResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('rejects a rating below 1', () => {
    expect(surveyResponseSchema.safeParse({ ...validResponse, waitTime: 0 }).success).toBe(false);
  });

  it('rejects a rating above 5', () => {
    expect(
      surveyResponseSchema.safeParse({ ...validResponse, overallSatisfaction: 6 }).success
    ).toBe(false);
  });

  it('rejects comments longer than 500 characters', () => {
    expect(
      surveyResponseSchema.safeParse({ ...validResponse, comments: 'a'.repeat(501) }).success
    ).toBe(false);
  });

  it('accepts an optional comment within the length limit', () => {
    expect(
      surveyResponseSchema.safeParse({ ...validResponse, comments: 'Great visit!' }).success
    ).toBe(true);
  });

  it('requires wouldRecommend to be a boolean', () => {
    expect(
      surveyResponseSchema.safeParse({ ...validResponse, wouldRecommend: 'yes' }).success
    ).toBe(false);
  });
});
