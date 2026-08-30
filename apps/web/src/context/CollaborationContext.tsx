/**
 * Collaboration Context
 * Manages real-time collaborative editing state
 * Issue #1234
 */

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from '@web/lib/socket';

interface Collaborator {
  userId: string;
  userName: string;
  color: string;
  cursorPosition?: { line: number; column: number };
  selectionRange?: { start: number; end: number };
}

interface EditOperation {
  id: string;
  userId: string;
  type: 'insert' | 'delete' | 'replace';
  position: number;
  content?: string;
  version: number;
  timestamp: Date;
}

interface CollaborationContextType {
  collaborators: Map<string, Collaborator>;
  isEditing: boolean;
  currentResource?: { type: string; id: string };
  operations: EditOperation[];
  documentVersion: number;
  startEditing: (resourceId: string, resourceType: string, color: string) => void;
  stopEditing: (resourceId: string, resourceType: string) => void;
  updateCursor: (
    position: { line: number; column: number },
    selection?: { start: number; end: number }
  ) => void;
  sendEditOperation: (operation: Omit<EditOperation, 'id' | 'timestamp' | 'version'>) => void;
  requestSync: () => void;
}

const CollaborationContext = createContext<CollaborationContextType | undefined>(undefined);

export function CollaborationProvider({
  children,
  token,
}: {
  children: React.ReactNode;
  token?: string;
}) {
  const { socket } = useSocket(token);
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map());
  const [isEditing, setIsEditing] = useState(false);
  const [currentResource, setCurrentResource] = useState<{ type: string; id: string }>();
  const [operations, setOperations] = useState<EditOperation[]>([]);
  const [documentVersion, setDocumentVersion] = useState(0);

  // Listen for collaborator updates
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = (data: any) => {
      setCollaborators((prev) => {
        const map = new Map(prev);
        if (data.activeUsers) {
          data.activeUsers.forEach((user: Collaborator) => {
            map.set(user.userId, { ...user });
          });
        }
        return map;
      });
    };

    const handleUserLeft = (data: any) => {
      setCollaborators((prev) => {
        const map = new Map(prev);
        map.delete(data.userId);
        return map;
      });
    };

    const handleCursorUpdate = (data: any) => {
      setCollaborators((prev) => {
        const map = new Map(prev);
        const collaborator = map.get(data.userId);
        if (collaborator) {
          collaborator.cursorPosition = data.cursorPosition;
          collaborator.selectionRange = data.selectionRange;
        }
        return map;
      });
    };

    const handleEditOperation = (data: any) => {
      setOperations((prev) => [...prev, data.operation]);
      setDocumentVersion(data.operation.version);
    };

    const handleSync = (data: any) => {
      setOperations(data.operations);
      setDocumentVersion(data.version);
      const collaboratorMap = new Map<string, Collaborator>();
      data.presence.forEach((p: any) => {
        collaboratorMap.set(p.userId, p);
      });
      setCollaborators(collaboratorMap);
    };

    socket.on('collaboration:user-joined', handleUserJoined);
    socket.on('collaboration:user-left', handleUserLeft);
    socket.on('collaboration:cursor-update', handleCursorUpdate);
    socket.on('collaboration:edit-operation', handleEditOperation);
    socket.on('collaboration:sync', handleSync);

    return () => {
      socket.off('collaboration:user-joined', handleUserJoined);
      socket.off('collaboration:user-left', handleUserLeft);
      socket.off('collaboration:cursor-update', handleCursorUpdate);
      socket.off('collaboration:edit-operation', handleEditOperation);
      socket.off('collaboration:sync', handleSync);
    };
  }, [socket]);

  const startEditing = useCallback(
    (resourceId: string, resourceType: string, color: string) => {
      if (socket?.connected) {
        socket.emit('collaboration:start-editing', { resourceId, resourceType, color });
        setIsEditing(true);
        setCurrentResource({ type: resourceType, id: resourceId });
      }
    },
    [socket]
  );

  const stopEditing = useCallback(
    (resourceId: string, resourceType: string) => {
      if (socket?.connected) {
        socket.emit('collaboration:stop-editing', { resourceId, resourceType });
        setIsEditing(false);
        setCurrentResource(undefined);
      }
    },
    [socket]
  );

  const updateCursor = useCallback(
    (position: { line: number; column: number }, selection?: { start: number; end: number }) => {
      if (socket?.connected && currentResource) {
        socket.emit('collaboration:cursor-move', {
          resourceId: currentResource.id,
          resourceType: currentResource.type,
          cursorPosition: position,
          selectionRange: selection,
        });
      }
    },
    [socket, currentResource]
  );

  const sendEditOperation = useCallback(
    (operation: Omit<EditOperation, 'id' | 'timestamp' | 'version'>) => {
      if (socket?.connected && currentResource) {
        socket.emit('collaboration:edit-operation', {
          resourceId: currentResource.id,
          resourceType: currentResource.type,
          operation,
        });
      }
    },
    [socket, currentResource]
  );

  const requestSync = useCallback(() => {
    if (socket?.connected && currentResource) {
      socket.emit('collaboration:request-sync', {
        resourceId: currentResource.id,
        resourceType: currentResource.type,
      });
    }
  }, [socket, currentResource]);

  const value: CollaborationContextType = {
    collaborators,
    isEditing,
    currentResource,
    operations,
    documentVersion,
    startEditing,
    stopEditing,
    updateCursor,
    sendEditOperation,
    requestSync,
  };

  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
}

export function useCollaboration() {
  const context = React.useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within CollaborationProvider');
  }
  return context;
}
