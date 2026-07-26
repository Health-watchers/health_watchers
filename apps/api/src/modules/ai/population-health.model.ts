import mongoose, { Schema, Document } from 'mongoose';

export interface PopulationHealthInsight extends Document {
  clinicId: mongoose.Types.ObjectId;
  generatedAt: Date;
  metrics: {
    totalPatients: number;
    ageDistribution: { range: string; count: number }[];
    diseasePrevalence: { diagnosis: string; count: number; percentage: number }[];
    averageVitalSigns: {
      systolicBP?: number;
      diastolicBP?: number;
      heartRate?: number;
      temperature?: number;
    };
    medicationUsagePatterns: { medication: string; count: number }[];
    screeningComplianceRate: number;
    chronicDiseaseManagementRate: number;
  };
  aiInsights: {
    keyTrends: string[];
    highRiskSegments: string[];
    recommendedInterventions: string[];
    seasonalPatterns?: string[];
  };
  outbreakAlerts?: {
    detected: boolean;
    diagnosis?: string;
    count?: number;
    threshold?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const populationHealthSchema = new Schema<PopulationHealthInsight>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    generatedAt: { type: Date, required: true },
    metrics: {
      totalPatients: Number,
      ageDistribution: [{ range: String, count: Number }],
      diseasePrevalence: [{ diagnosis: String, count: Number, percentage: Number }],
      averageVitalSigns: {
        systolicBP: Number,
        diastolicBP: Number,
        heartRate: Number,
        temperature: Number,
      },
      medicationUsagePatterns: [{ medication: String, count: Number }],
      screeningComplianceRate: Number,
      chronicDiseaseManagementRate: Number,
    },
    aiInsights: {
      keyTrends: [String],
      highRiskSegments: [String],
      recommendedInterventions: [String],
      seasonalPatterns: [String],
    },
    outbreakAlerts: {
      detected: Boolean,
      diagnosis: String,
      count: Number,
      threshold: Number,
    },
  },
  { timestamps: true }
);

export const PopulationHealthModel = mongoose.model<PopulationHealthInsight>(
  'PopulationHealth',
  populationHealthSchema
);
