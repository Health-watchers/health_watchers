import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { authService } from '../services/auth.service';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  invoiceCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
    marginBottom: 12,
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  invoiceStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  payButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  payButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  walletButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  walletButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export function PaymentScreen() {
  const [invoices, setInvoices] = useState<any[]>([]);

  const handlePayWithStellar = async (invoiceId: string, amount: string) => {
    try {
      // Deep link to Lobstr or Solar wallet
      const stellarUri = `stellar:pay?destination=CLINIC_WALLET&amount=${amount}&memo=${invoiceId}`;
      const canOpen = await Linking.canOpenURL(stellarUri);

      if (canOpen) {
        await Linking.openURL(stellarUri);
      } else {
        // Fallback to Solar wallet
        const solarUri = `solar:pay?destination=CLINIC_WALLET&amount=${amount}&memo=${invoiceId}`;
        await Linking.openURL(solarUri);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open Stellar wallet');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Outstanding Invoices</Text>
        {invoices.length > 0 ? (
          invoices.map((invoice: any) => (
            <View key={invoice._id} style={styles.invoiceCard}>
              <Text style={styles.invoiceAmount}>{invoice.amount} XLM</Text>
              <Text style={styles.invoiceStatus}>
                Due: {new Date(invoice.dueDate).toLocaleDateString()}
              </Text>
              <TouchableOpacity
                style={styles.payButton}
                onPress={() => handlePayWithStellar(invoice._id, invoice.amount)}
              >
                <Text style={styles.payButtonText}>Pay with Stellar</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.invoiceStatus}>No outstanding invoices</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        <TouchableOpacity style={styles.walletButton}>
          <Text style={styles.walletButtonText}>Configure Stellar Wallet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
