import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { PaymentData } from './types';

interface PaymentInterfaceProps {
  amount: number;
  currency?: string;
  description?: string;
  onPaymentMethodSelect?: (method: 'card' | 'bank' | 'wallet' | 'insurance') => void;
  onPaymentProcess?: (details: PaymentDetails) => Promise<void>;
}

export interface PaymentDetails {
  method: 'card' | 'bank' | 'wallet' | 'insurance';
  amount: number;
  currency: string;
}

export function PaymentInterface({
  amount,
  currency = 'USD',
  description,
  onPaymentMethodSelect,
  onPaymentProcess,
}: PaymentInterfaceProps) {
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'bank' | 'wallet' | 'insurance' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');

  const handleMethodSelect = (method: 'card' | 'bank' | 'wallet' | 'insurance') => {
    setSelectedMethod(method);
    onPaymentMethodSelect?.(method);
  };

  const handlePaymentProcess = async () => {
    if (!selectedMethod) return;

    setIsProcessing(true);
    try {
      await onPaymentProcess?.({
        method: selectedMethod,
        amount,
        currency,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted.slice(0, 19));
  };

  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      setExpiryDate(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    } else {
      setExpiryDate(cleaned);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <SafeAreaView style={styles.content}>
        <ScrollView>
          <View style={styles.header}>
            <Text style={styles.title}>Payment</Text>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Total Amount</Text>
              <Text style={styles.amount}>
                {currency} {amount.toFixed(2)}
              </Text>
            </View>
          </View>

          {description && (
            <Text style={styles.description}>{description}</Text>
          )}

          <Text style={styles.methodsTitle}>Payment Method</Text>

          <View style={styles.methodsContainer}>
            <PaymentMethodButton
              icon="💳"
              label="Card"
              method="card"
              selected={selectedMethod === 'card'}
              onPress={() => handleMethodSelect('card')}
            />
            <PaymentMethodButton
              icon="🏦"
              label="Bank Transfer"
              method="bank"
              selected={selectedMethod === 'bank'}
              onPress={() => handleMethodSelect('bank')}
            />
            <PaymentMethodButton
              icon="👛"
              label="Wallet"
              method="wallet"
              selected={selectedMethod === 'wallet'}
              onPress={() => handleMethodSelect('wallet')}
            />
            <PaymentMethodButton
              icon="🏥"
              label="Insurance"
              method="insurance"
              selected={selectedMethod === 'insurance'}
              onPress={() => handleMethodSelect('insurance')}
            />
          </View>

          {selectedMethod === 'card' && (
            <View style={styles.cardForm}>
              <Text style={styles.sectionTitle}>Card Details</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Card Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChangeText={formatCardNumber}
                  keyboardType="numeric"
                  maxLength={19}
                  editable={!isProcessing}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, styles.flex]}>
                  <Text style={styles.label}>Expiry Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="MM/YY"
                    value={expiryDate}
                    onChangeText={formatExpiryDate}
                    keyboardType="numeric"
                    maxLength={5}
                    editable={!isProcessing}
                  />
                </View>

                <View style={[styles.formGroup, styles.flex]}>
                  <Text style={styles.label}>CVV</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    value={cvv}
                    onChangeText={setCvv}
                    keyboardType="numeric"
                    maxLength={3}
                    secureTextEntry
                    editable={!isProcessing}
                  />
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.payButton,
              (!selectedMethod || isProcessing) && styles.payButtonDisabled,
            ]}
            onPress={handlePaymentProcess}
            disabled={!selectedMethod || isProcessing}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={styles.payButtonText}>
              {isProcessing ? 'Processing...' : `Pay ${currency} ${amount.toFixed(2)}`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

interface PaymentMethodButtonProps {
  icon: string;
  label: string;
  method: 'card' | 'bank' | 'wallet' | 'insurance';
  selected: boolean;
  onPress: () => void;
}

function PaymentMethodButton({
  icon,
  label,
  selected,
  onPress,
}: PaymentMethodButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.methodButton,
        selected && styles.methodButtonSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.methodIcon}>{icon}</Text>
      <Text
        style={[
          styles.methodLabel,
          selected && styles.methodLabelSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  amountBox: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  amountLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  amount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  methodsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  methodsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  methodButton: {
    width: '48%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: '1%',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  methodIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  methodLabelSelected: {
    color: '#2563eb',
  },
  cardForm: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#f9fafb',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
    marginRight: 8,
  },
  payButton: {
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 14,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  payButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
