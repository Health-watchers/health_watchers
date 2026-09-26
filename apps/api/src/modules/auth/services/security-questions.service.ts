/**
 * Security Questions Service
 * Provides alternative account recovery mechanism
 * Issue #1235
 */

import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';

export const PREDEFINED_QUESTIONS = [
  'What is the name of your first pet?',
  'In what city were you born?',
  "What is your mother's maiden name?",
  'What was the name of your first school?',
  'What is your favorite book?',
  'What street did you grow up on?',
  'What is your favorite movie?',
  'What is the name of your best friend from childhood?',
  'What was your favorite toy as a child?',
  'What is the name of the city where you were born?',
];

export interface SecurityQuestion {
  questionId: number;
  question: string;
  answerHash: string;
  createdAt: Date;
}

export class SecurityQuestionsService {
  /**
   * Get predefined questions
   */
  getPredefinedQuestions(): Array<{ id: number; question: string }> {
    return PREDEFINED_QUESTIONS.map((question, id) => ({
      id,
      question,
    }));
  }

  /**
   * Set security questions for user
   */
  async setSecurityQuestions(
    userId: string,
    questions: Array<{
      questionId: number;
      answer: string;
    }>
  ): Promise<void> {
    // Validate question IDs
    if (questions.some((q) => q.questionId < 0 || q.questionId >= PREDEFINED_QUESTIONS.length)) {
      throw new Error('Invalid question ID');
    }

    // Ensure at least 3 questions
    if (questions.length < 3) {
      throw new Error('Must set at least 3 security questions');
    }

    // Hash answers and prepare data
    const securityQuestions: SecurityQuestion[] = await Promise.all(
      questions.map(async (q) => ({
        questionId: q.questionId,
        question: PREDEFINED_QUESTIONS[q.questionId],
        answerHash: await bcrypt.hash(q.answer.toLowerCase().trim(), 12),
        createdAt: new Date(),
      }))
    );

    await UserModel.findByIdAndUpdate(userId, {
      securityQuestions,
      securityQuestionsSetAt: new Date(),
    });
  }

  /**
   * Verify security question answers
   */
  async verifyAnswers(
    userId: string,
    answers: Array<{
      questionId: number;
      answer: string;
    }>
  ): Promise<boolean> {
    const user = await UserModel.findById(userId).select('securityQuestions');
    if (!user || !user.securityQuestions || user.securityQuestions.length === 0) {
      throw new Error('User has not set security questions');
    }

    // Verify all provided answers
    let correctCount = 0;
    for (const answer of answers) {
      const question = user.securityQuestions.find((q: any) => q.questionId === answer.questionId);
      if (question) {
        const matches = await bcrypt.compare(
          answer.answer.toLowerCase().trim(),
          question.answerHash
        );
        if (matches) {
          correctCount++;
        }
      }
    }

    // Require at least 2 out of 3 correct
    return correctCount >= Math.ceil(user.securityQuestions.length * 0.66);
  }

  /**
   * Get security questions for user (without answers)
   */
  async getSecurityQuestions(
    userId: string
  ): Promise<Array<{ questionId: number; question: string }>> {
    const user = await UserModel.findById(userId).select('securityQuestions');
    if (!user || !user.securityQuestions) {
      throw new Error('User has not set security questions');
    }

    return user.securityQuestions.map((q: any) => ({
      questionId: q.questionId,
      question: q.question,
    }));
  }

  /**
   * Check if user has security questions set
   */
  async hasSecurityQuestions(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('securityQuestions');
    return !!(user && user.securityQuestions && user.securityQuestions.length > 0);
  }
}

export const securityQuestionsService = new SecurityQuestionsService();
