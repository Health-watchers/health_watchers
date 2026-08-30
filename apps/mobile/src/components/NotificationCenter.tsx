import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  SectionList,
  Alert,
} from 'react-native';
import type { NotificationData } from './types';

interface NotificationCenterProps {
  notifications: NotificationData[];
  onNotificationPress?: (notification: NotificationData) => void;
  onMarkAsRead?: (notificationId: string) => Promise<void>;
  onClearAll?: () => Promise<void>;
}

const NOTIFICATION_ICONS: Record<NotificationData['type'], string> = {
  appointment: '📅',
  payment: '💰',
  alert: '⚠️',
  info: 'ℹ️',
};

export function NotificationCenter({
  notifications,
  onNotificationPress,
  onMarkAsRead,
  onClearAll,
}: NotificationCenterProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupedNotifications = groupNotificationsByDate(notifications);

  const handleMarkAsRead = async (notification: NotificationData) => {
    if (!notification.read && onMarkAsRead) {
      await onMarkAsRead(notification.id);
    }
  };

  const handleClearAll = async () => {
    Alert.alert('Clear All Notifications', 'Are you sure you want to clear all notifications?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Clear',
        onPress: async () => {
          await onClearAll?.();
        },
        style: 'destructive',
      },
    ]);
  };

  const renderNotification = ({ item: notification }: { item: NotificationData }) => {
    const isExpanded = expandedId === notification.id;

    return (
      <TouchableOpacity
        style={[styles.notificationCard, !notification.read && styles.unreadCard]}
        onPress={() => {
          setExpandedId(isExpanded ? null : notification.id);
          handleMarkAsRead(notification);
          onNotificationPress?.(notification);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.notificationContent}>
          <Text style={styles.notificationIcon}>{NOTIFICATION_ICONS[notification.type]}</Text>
          <View style={styles.notificationText}>
            <Text style={[styles.notificationTitle, !notification.read && styles.unreadTitle]}>
              {notification.title}
            </Text>
            <Text numberOfLines={isExpanded ? 0 : 2} style={styles.notificationMessage}>
              {notification.message}
            </Text>
            <Text style={styles.notificationTime}>{formatTime(notification.timestamp)}</Text>
          </View>
          {!notification.read && <View style={styles.unreadIndicator} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: any }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  return (
    <SafeAreaView style={styles.container}>
      {notifications.length > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity
            onPress={handleClearAll}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.clearButton}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      {notifications.length > 0 ? (
        <SectionList
          sections={groupedNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          scrollEnabled
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>🔔</Text>
          <Text style={styles.emptyStateTitle}>No Notifications</Text>
          <Text style={styles.emptyStateMessage}>
            You're all caught up! You'll see notifications here when you have new messages.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function groupNotificationsByDate(
  notifications: NotificationData[]
): Array<{ title: string; data: NotificationData[] }> {
  const groups: Record<string, NotificationData[]> = {
    Today: [],
    Yesterday: [],
    Older: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  notifications.forEach((notification) => {
    const notifDate = new Date(notification.timestamp);
    notifDate.setHours(0, 0, 0, 0);

    if (notifDate.getTime() === today.getTime()) {
      groups.Today.push(notification);
    } else if (notifDate.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(notification);
    } else {
      groups.Older.push(notification);
    }
  });

  return Object.entries(groups)
    .filter(([_, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }));
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  clearButton: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: 'uppercase',
  },
  notificationCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  unreadCard: {
    backgroundColor: '#eff6ff',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginLeft: 8,
    marginTop: 4,
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
