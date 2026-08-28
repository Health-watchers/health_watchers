import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Platform,
  SafeAreaView,
} from 'react-native';

export interface TabItem {
  name: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  active?: boolean;
}

interface BottomTabBarProps {
  tabs: TabItem[];
  activeTab?: string;
}

export function BottomTabBar({ tabs, activeTab }: BottomTabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[
              styles.tab,
              tab.name === activeTab && styles.activeTab,
            ]}
            onPress={tab.onPress}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab.name === activeTab }}
          >
            <View style={styles.iconContainer}>
              {tab.icon}
            </View>
            <Text
              style={[
                styles.label,
                tab.name === activeTab && styles.activeLabel,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    borderTopWidth: 3,
    borderTopColor: '#2563eb',
  },
  iconContainer: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeLabel: {
    color: '#2563eb',
  },
});
