// Stub declarations for packages not installed locally; installed during CI via npm ci
declare module 'react' {
  const React: any;
  export default React;
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(init?: T): { current: T };
  export function useContext<T>(ctx: any): T;
  export function createContext<T>(defaultValue: T): any;
  export type ReactNode = any;
  export type FC<P = {}> = (props: P) => any;
}
declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const TouchableOpacity: any;
  export const ScrollView: any;
  export const StyleSheet: any;
  export const ActivityIndicator: any;
  export const Alert: any;
  export const FlatList: any;
  export const TextInput: any;
  export const Image: any;
  export const Platform: any;
  export const Dimensions: any;
  export const Linking: any;
}
declare module '@react-navigation/native' {
  export const useNavigation: any;
  export const useRoute: any;
  export const NavigationContainer: any;
}
declare module '@react-navigation/native-stack' {
  const createNativeStackNavigator: any;
  export default createNativeStackNavigator;
  export { createNativeStackNavigator };
}
declare module '@react-navigation/bottom-tabs' {
  const createBottomTabNavigator: any;
  export default createBottomTabNavigator;
  export { createBottomTabNavigator };
}
declare module 'axios' {
  const axios: any;
  export default axios;
  export type AxiosInstance = any;
}
declare module 'date-fns' {
  export const formatDistanceToNow: any;
  export const format: any;
}
declare module 'expo-notifications' {
  export function setNotificationHandler(handler: any): void;
  export function getPermissionsAsync(): Promise<any>;
  export function requestPermissionsAsync(): Promise<any>;
  export function getExpoPushTokenAsync(): Promise<any>;
  export function addNotificationResponseReceivedListener(listener: any): any;
  const _default: any;
  export default _default;
}
declare module 'expo-secure-store' {
  export const getItemAsync: any;
  export const setItemAsync: any;
  export const deleteItemAsync: any;
}
declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: any;
  export default AsyncStorage;
}
declare module 'react-query' {
  export const useQuery: any;
  export const useMutation: any;
  export const useQueryClient: any;
  export const QueryClient: any;
  export const QueryClientProvider: any;
}
