import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { DocumentData } from './types';

interface DocumentViewerProps {
  documents: DocumentData[];
  onDocumentOpen?: (document: DocumentData) => Promise<void>;
  onDocumentDownload?: (document: DocumentData) => Promise<void>;
  onDocumentDelete?: (documentId: string) => Promise<void>;
}

const DOCUMENT_ICONS: Record<DocumentData['type'], string> = {
  pdf: '📄',
  image: '🖼️',
  document: '📋',
};

export function DocumentViewer({
  documents,
  onDocumentOpen,
  onDocumentDownload,
  onDocumentDelete,
}: DocumentViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleOpen = async (document: DocumentData) => {
    if (!onDocumentOpen) return;

    setLoading(document.id);
    try {
      await onDocumentOpen(document);
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async (document: DocumentData) => {
    if (!onDocumentDownload) return;

    setLoading(document.id);
    try {
      await onDocumentDownload(document);
      Alert.alert('Success', 'Document downloaded successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to download document');
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = (document: DocumentData) => {
    Alert.alert('Delete Document', `Are you sure you want to delete "${document.name}"?`, [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          await onDocumentDelete?.(document.id);
        },
        style: 'destructive',
      },
    ]);
  };

  const renderDocument = ({ item: document }: { item: DocumentData }) => {
    const isLoading = loading === document.id;

    return (
      <TouchableOpacity
        style={[styles.documentCard, selectedId === document.id && styles.selectedCard]}
        onPress={() => setSelectedId(selectedId === document.id ? null : document.id)}
        activeOpacity={0.7}
      >
        <View style={styles.documentHeader}>
          <Text style={styles.documentIcon}>{DOCUMENT_ICONS[document.type]}</Text>
          <View style={styles.documentInfo}>
            <Text style={styles.documentName} numberOfLines={1}>
              {document.name}
            </Text>
            <Text style={styles.documentDetails}>
              {formatFileSize(document.size)} • {formatDate(document.date)}
            </Text>
          </View>
        </View>

        {selectedId === document.id && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.openButton]}
              onPress={() => handleOpen(document)}
              disabled={isLoading}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Text style={styles.actionButtonText}>Open</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.downloadButton]}
              onPress={() => handleDownload(document)}
              disabled={isLoading}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Text style={styles.actionButtonText}>Download</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDelete(document)}
              disabled={isLoading}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        {documents.length > 0 && <Text style={styles.count}>{documents.length}</Text>}
      </View>

      {documents.length > 0 ? (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderDocument}
          contentContainerStyle={styles.listContent}
          scrollEnabled
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📁</Text>
          <Text style={styles.emptyStateTitle}>No Documents</Text>
          <Text style={styles.emptyStateMessage}>
            Your documents will appear here once you upload them.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  documentCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  selectedCard: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  documentDetails: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    paddingTopWithInput: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButton: {
    backgroundColor: '#2563eb',
  },
  downloadButton: {
    backgroundColor: '#e5e7eb',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991b1b',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
