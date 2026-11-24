import { ViewStyle, TextStyle } from 'react-native';

export interface TouchTarget {
  minHeight: number;
  minWidth: number;
}

export const TOUCH_TARGET: TouchTarget = {
  minHeight: 44,
  minWidth: 44,
};

export interface AppointmentData {
  id: string;
  title: string;
  doctorName: string;
  date: string;
  time: string;
  location: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface PaymentData {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  date: string;
}

export interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: 'appointment' | 'payment' | 'alert' | 'info';
  read: boolean;
  timestamp: string;
}

export interface DocumentData {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'document';
  size: number;
  url: string;
  date: string;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}
