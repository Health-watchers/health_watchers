import mongoose from 'mongoose';
import { SurveyModel } from '../survey.model';

const baseDoc = {
  encounterId: new mongoose.Types.ObjectId(),
  patientId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  doctorId: new mongoose.Types.ObjectId(),
  token: 'survey-token-1',
  expiresAt: new Date('2026-06-01'),
};

describe('SurveyModel', () => {
  it('validates a minimal valid survey', async () => {
    const survey = new SurveyModel(baseDoc);
    await expect(survey.validate()).resolves.toBeUndefined();
  });

  it('requires a token', async () => {
    const survey = new SurveyModel({ ...baseDoc, token: undefined });
    await expect(survey.validate()).rejects.toThrow(/token/);
  });

  it('requires expiresAt', async () => {
    const survey = new SurveyModel({ ...baseDoc, expiresAt: undefined });
    await expect(survey.validate()).rejects.toThrow(/expiresAt/);
  });

  it('defaults status to pending', () => {
    const survey = new SurveyModel(baseDoc);
    expect(survey.status).toBe('pending');
  });

  it('validates embedded responses within range', async () => {
    const survey = new SurveyModel({
      ...baseDoc,
      responses: {
        overallSatisfaction: 5,
        waitTime: 4,
        doctorCommunication: 5,
        staffFriendliness: 5,
        facilityCleanness: 4,
        wouldRecommend: true,
      },
    });
    await expect(survey.validate()).resolves.toBeUndefined();
  });

  it('rejects a response rating outside 1-5', async () => {
    const survey = new SurveyModel({
      ...baseDoc,
      responses: {
        overallSatisfaction: 6,
        waitTime: 4,
        doctorCommunication: 5,
        staffFriendliness: 5,
        facilityCleanness: 4,
        wouldRecommend: true,
      },
    });
    await expect(survey.validate()).rejects.toThrow();
  });
});
