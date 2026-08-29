import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DocumentRecord, HealthWorkflowsService } from '../services/health-workflows.service';

const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png'];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#333' },
  input: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  dropZone: {
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  button: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  card: { borderBottomColor: '#eee', borderBottomWidth: 1, paddingVertical: 12 },
  meta: { color: '#666', fontSize: 12, marginTop: 4 },
});

export function DocumentsScreen() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    HealthWorkflowsService.listDocuments().then(setDocuments);
  }, []);

  const fileType = useMemo(() => name.split('.').pop()?.toLowerCase() ?? '', [name]);
  const isValid = allowedTypes.includes(fileType);

  const handleUpload = async () => {
    if (!name.trim() || !isValid) {
      Alert.alert('Invalid file', `Allowed document types: ${allowedTypes.join(', ')}`);
      return;
    }

    const document: DocumentRecord = {
      id: Date.now().toString(),
      name: name.trim(),
      type: fileType,
      url: url.trim() || undefined,
      ownerRole: 'patient',
      uploadedAt: new Date().toISOString(),
    };

    const saved = await HealthWorkflowsService.saveDocument(document);
    setDocuments((current) => [saved, ...current]);
    setName('');
    setUrl('');
  };

  const openDocument = async (document: DocumentRecord) => {
    setSelected(document);
    if (document.url) {
      await Linking.openURL(document.url);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>Upload Document</Text>
        <TouchableOpacity style={styles.dropZone}>
          <Text>Drag/drop on web or enter file details below</Text>
          <Text style={styles.meta}>PDF, JPG, JPEG, PNG only</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Document filename, e.g. lab-result.pdf"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="Document URL (optional)"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.button} onPress={handleUpload}>
          <Text style={styles.buttonText}>Upload Document</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Documents</Text>
        {documents.length === 0 ? (
          <Text style={styles.meta}>No documents uploaded</Text>
        ) : (
          documents.map((document) => (
            <TouchableOpacity
              key={document.id}
              style={styles.card}
              onPress={() => openDocument(document)}
            >
              <Text>{document.name}</Text>
              <Text style={styles.meta}>
                {document.type.toUpperCase()} • {new Date(document.uploadedAt).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selected ? (
        <View style={styles.section}>
          <Text style={styles.title}>Viewer</Text>
          <Text>{selected.name}</Text>
          <Text style={styles.meta}>
            Permissions: visible to {selected.ownerRole ?? 'authorized care team'}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
