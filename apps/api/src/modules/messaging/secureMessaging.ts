/**
 * Secure patient-provider messaging system.
 *
 * Provides message encryption, threading, attachments with virus-scan
 * status, read/unread tracking, search/filtering, expiration policies,
 * templates, urgent flagging, delivery confirmation, and communication
 * analytics with a HIPAA-oriented audit trail.
 */

import crypto from "crypto";

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: "pending" | "clean" | "infected" | "error";
  scannedAt?: number;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  encrypted: EncryptedPayload;
  attachments: Attachment[];
  urgent: boolean;
  sentAt: number;
  readAt?: number;
  deliveredAt?: number;
  expiresAt?: number;
  templateId?: string;
}

export interface MessageThread {
  id: string;
  participantIds: string[];
  subject: string;
  createdAt: number;
  lastMessageAt: number;
}

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
}

export interface HipaaAuditEntry {
  timestamp: number;
  actorId: string;
  action: "message_sent" | "message_read" | "message_deleted" | "attachment_scanned";
  messageId: string;
}

/** AES-256-GCM end-to-end style encryption for message bodies. */
export class MessageEncryption {
  private algorithm = "aes-256-gcm";

  encrypt(plaintext: string, key: Buffer): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(payload: EncryptedPayload, key: Buffer): string {
    const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  static generateKey(): Buffer {
    return crypto.randomBytes(32);
  }
}

/** Placeholder virus scanning interface — pluggable with a real scan engine. */
export interface VirusScanner {
  scan(fileBuffer: Buffer, fileName: string): Promise<"clean" | "infected" | "error">;
}

export class SimpleSignatureScanner implements VirusScanner {
  private knownBadSignatures = ["EICAR-STANDARD-ANTIVIRUS-TEST-FILE"];

  async scan(fileBuffer: Buffer, _fileName: string): Promise<"clean" | "infected" | "error"> {
    try {
      const content = fileBuffer.toString("utf8");
      const infected = this.knownBadSignatures.some((sig) => content.includes(sig));
      return infected ? "infected" : "clean";
    } catch {
      return "error";
    }
  }
}

export class SecureMessagingService {
  private threads = new Map<string, MessageThread>();
  private messages = new Map<string, Message>();
  private templates = new Map<string, MessageTemplate>();
  private auditTrail: HipaaAuditEntry[] = [];
  private encryption = new MessageEncryption();
  private scanner: VirusScanner;
  private encryptionKey: Buffer;
  private defaultExpirationMs = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor(scanner: VirusScanner = new SimpleSignatureScanner(), encryptionKey = MessageEncryption.generateKey()) {
    this.scanner = scanner;
    this.encryptionKey = encryptionKey;
  }

  private id(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  createThread(participantIds: string[], subject: string): MessageThread {
    const thread: MessageThread = {
      id: this.id("thread"),
      participantIds,
      subject,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    };
    this.threads.set(thread.id, thread);
    return thread;
  }

  async sendMessage(input: {
    threadId: string;
    senderId: string;
    recipientId: string;
    body: string;
    urgent?: boolean;
    attachmentFiles?: { fileName: string; mimeType: string; buffer: Buffer }[];
    templateId?: string;
  }): Promise<Message> {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error(`Thread ${input.threadId} not found`);

    const attachments: Attachment[] = [];
    for (const file of input.attachmentFiles ?? []) {
      const scanStatus = await this.scanner.scan(file.buffer, file.fileName);
      const attachment: Attachment = {
        id: this.id("att"),
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.length,
        scanStatus,
        scannedAt: Date.now(),
      };
      attachments.push(attachment);
      this.audit(input.senderId, "attachment_scanned", attachment.id);
    }

    const message: Message = {
      id: this.id("msg"),
      threadId: input.threadId,
      senderId: input.senderId,
      recipientId: input.recipientId,
      encrypted: this.encryption.encrypt(input.body, this.encryptionKey),
      attachments,
      urgent: input.urgent ?? false,
      sentAt: Date.now(),
      deliveredAt: Date.now(),
      expiresAt: Date.now() + this.defaultExpirationMs,
      templateId: input.templateId,
    };

    this.messages.set(message.id, message);
    thread.lastMessageAt = message.sentAt;
    this.audit(input.senderId, "message_sent", message.id);
    return message;
  }

  readMessage(messageId: string, readerId: string): string {
    const message = this.messages.get(messageId);
    if (!message) throw new Error(`Message ${messageId} not found`);
    if (!message.readAt) message.readAt = Date.now();
    this.audit(readerId, "message_read", messageId);
    return this.encryption.decrypt(message.encrypted, this.encryptionKey);
  }

  getUnreadCount(userId: string): number {
    return [...this.messages.values()].filter((m) => m.recipientId === userId && !m.readAt).length;
  }

  /** Search decrypted message bodies within a thread; bounded for the <500ms target. */
  search(threadId: string, query: string, limit = 50): Message[] {
    const lower = query.toLowerCase();
    const results: Message[] = [];
    for (const message of this.messages.values()) {
      if (message.threadId !== threadId) continue;
      const body = this.encryption.decrypt(message.encrypted, this.encryptionKey);
      if (body.toLowerCase().includes(lower)) {
        results.push(message);
        if (results.length >= limit) break;
      }
    }
    return results.sort((a, b) => b.sentAt - a.sentAt);
  }

  filterMessages(filter: { urgent?: boolean; unreadOnly?: boolean; recipientId?: string }): Message[] {
    return [...this.messages.values()].filter((m) => {
      if (filter.urgent !== undefined && m.urgent !== filter.urgent) return false;
      if (filter.unreadOnly && m.readAt) return false;
      if (filter.recipientId && m.recipientId !== filter.recipientId) return false;
      return true;
    });
  }

  purgeExpiredMessages(): number {
    const now = Date.now();
    let purged = 0;
    for (const [id, message] of this.messages) {
      if (message.expiresAt && message.expiresAt < now) {
        this.messages.delete(id);
        this.audit("system", "message_deleted", id);
        purged += 1;
      }
    }
    return purged;
  }

  registerTemplate(template: MessageTemplate): void {
    this.templates.set(template.id, template);
  }

  getTemplate(templateId: string): MessageTemplate | undefined {
    return this.templates.get(templateId);
  }

  private audit(actorId: string, action: HipaaAuditEntry["action"], messageId: string): void {
    this.auditTrail.push({ timestamp: Date.now(), actorId, action, messageId });
  }

  getAuditTrail(messageId?: string): HipaaAuditEntry[] {
    return messageId ? this.auditTrail.filter((e) => e.messageId === messageId) : this.auditTrail;
  }

  /** Communication analytics: volume, response time, urgent ratio. */
  analytics(windowMs = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - windowMs;
    const inWindow = [...this.messages.values()].filter((m) => m.sentAt >= cutoff);
    const urgentCount = inWindow.filter((m) => m.urgent).length;
    const readTimes = inWindow.filter((m) => m.readAt).map((m) => m.readAt! - m.sentAt);
    const avgReadTimeMs = readTimes.length ? readTimes.reduce((a, b) => a + b, 0) / readTimes.length : 0;

    return {
      totalMessages: inWindow.length,
      urgentMessages: urgentCount,
      averageReadTimeMs: avgReadTimeMs,
      unreadCount: inWindow.filter((m) => !m.readAt).length,
    };
  }
}

export const secureMessagingService = new SecureMessagingService();

secureMessagingService.registerTemplate({
  id: "appointment-reminder",
  title: "Appointment Reminder",
  body: "This is a reminder of your upcoming appointment. Please reply to confirm.",
});

secureMessagingService.registerTemplate({
  id: "lab-results-ready",
  title: "Lab Results Ready",
  body: "Your recent lab results are available. Please log in to the patient portal to review them.",
});
