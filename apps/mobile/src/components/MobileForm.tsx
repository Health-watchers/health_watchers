import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import type { FormField } from './types';

interface MobileFormProps {
  fields: FormField[];
  onSubmit: (formData: Record<string, string>) => Promise<void>;
  submitButtonText?: string;
  title?: string;
}

export function MobileForm({
  fields,
  onSubmit,
  submitButtonText = 'Submit',
  title,
}: MobileFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    fields.forEach((field) => {
      if (field.required && !formData[field.name].trim()) {
        newErrors[field.name] = `${field.label} is required`;
      }

      if (field.type === 'email' && formData[field.name]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.name])) {
          newErrors[field.name] = 'Please enter a valid email address';
        }
      }

      if (field.type === 'phone' && formData[field.name]) {
        const phoneRegex = /^\d{10,}$/;
        if (!phoneRegex.test(formData[field.name].replace(/\D/g, ''))) {
          newErrors[field.name] = 'Please enter a valid phone number';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const error = errors[field.name];

    if (field.type === 'select') {
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>{field.label}</Text>
          <View style={[styles.select, error && styles.fieldError]}>
            <Text style={styles.selectText}>
              {formData[field.name] || field.placeholder || 'Select...'}
            </Text>
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );
    }

    const keyboardType =
      field.type === 'email'
        ? 'email-address'
        : field.type === 'phone'
          ? 'phone-pad'
          : field.type === 'number'
            ? 'numeric'
            : 'default';

    const multiline = field.type === 'textarea';

    return (
      <View key={field.name} style={styles.fieldContainer}>
        <Text style={styles.label}>{field.label}</Text>
        <TextInput
          style={[
            styles.input,
            multiline && styles.textarea,
            error && styles.fieldError,
          ]}
          placeholder={field.placeholder}
          value={formData[field.name]}
          onChangeText={(value) => handleChange(field.name, value)}
          keyboardType={keyboardType}
          secureTextEntry={field.type === 'password'}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          editable={!isSubmitting}
          placeholderTextColor="#d1d5db"
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <SafeAreaView style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {title && <Text style={styles.title}>{title}</Text>}

          {fields.map((field) => renderField(field))}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : submitButtonText}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 16,
    marginVertical: 16,
  },
  fieldContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
    minHeight: 44,
  },
  textarea: {
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  select: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    minHeight: 44,
    justifyContent: 'center',
  },
  selectText: {
    fontSize: 16,
    color: '#111827',
  },
  fieldError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  submitButton: {
    marginHorizontal: 16,
    marginVertical: 24,
    paddingVertical: 14,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
